import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  RETURN_REASON_LABEL,
  completeExchange,
  createReturnLabel,
  fetchReturn,
  refundNet,
  refundReturnWithPayPal,
  type ReturnRequest,
} from "@/lib/returns";
import { db, formatDate, run } from "@/lib/orders";
import { creditGiftCardForReturn } from "@/lib/giftCards";
import { formatDateTime } from "@/lib/warranty";
import { formatPrice } from "@/data/products";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "@/components/admin/StatusBadge";

/** Defective or wrong items: the seller always bears the return cost, so never deduct. */
const NO_DEDUCTION_REASONS = ["defective", "wrong_item"];

const Controls = ({ ret, onSaved }: { ret: ReturnRequest; onSaved: () => void }) => {
  const [message, setMessage] = useState(ret.customer_message);
  const [note, setNote] = useState(ret.internal_note);
  const [amount, setAmount] = useState(String(ret.refund_amount));
  const [deduction, setDeduction] = useState(String(ret.refund_deduction));
  const [reference, setReference] = useState(ret.refund_reference);

  useEffect(() => {
    setMessage(ret.customer_message);
    setNote(ret.internal_note);
    setAmount(String(ret.refund_amount));
    setDeduction(String(ret.refund_deduction));
    setReference(ret.refund_reference);
  }, [ret]);

  const closed = ["refunded", "rejected", "cancelled"].includes(ret.status);
  const exchange = ret.resolution === "exchange";
  const net = Math.max((Number(amount) || 0) - (Number(deduction) || 0), 0);
  const canDeductLabel = ret.label_cost > 0 && !NO_DEDUCTION_REASONS.includes(ret.reason);
  const refundDue = exchange ? Math.max(-Number(ret.settlement_amount), 0) : net;

  // A gift card may have paid part of the order (migration 0024; ignored if it is not applied yet).
  const { data: gift } = useQuery({
    queryKey: ["return-gift", ret.id, ret.status],
    queryFn: async () => {
      const order = await db.from("sales_orders").select("gift_card_amount, amount_charged").eq("id", ret.sales_order_id).maybeSingle();
      const returnRow = await db.from("return_requests").select("gift_card_refund").eq("id", ret.id).maybeSingle();
      return {
        paidByCard: Number(order.data?.gift_card_amount ?? 0),
        paidOtherwise: Number(order.data?.amount_charged ?? 0),
        credited: (returnRow.data?.gift_card_refund ?? null) as number | null,
      };
    },
    retry: false,
  });
  const cardPaid = gift?.paidByCard ?? 0;
  const cardCredit = gift?.credited ?? 0;
  const cardPending = cardPaid > 0 && gift?.credited === null;
  const suggestedCredit = cardPaid > 0 ? Math.round(refundDue * (cardPaid / (cardPaid + (gift?.paidOtherwise ?? 0))) * 100) / 100 : 0;
  const [creditAmount, setCreditAmount] = useState<string>();
  const payPalAmount = Math.max(Math.round((refundDue - cardCredit) * 100) / 100, 0);

  const update = useMutation({
    mutationFn: async ({ status, label }: { status?: ReturnRequest["status"]; label: string }) => {
      const refund = Number(amount);
      const deduct = Number(deduction);
      if (!(refund >= 0)) throw new Error("Enter a valid refund amount");
      if (!(deduct >= 0)) throw new Error("Enter a valid deduction");
      await run(
        db
          .from("return_requests")
          .update({
            ...(status ? { status } : {}),
            customer_message: message.trim(),
            internal_note: note.trim(),
            ...(ret.status !== "refunded" ? { refund_amount: refund, refund_deduction: deduct } : {}),
            refund_reference: reference.trim(),
            ...(status === "refunded" ? { refunded_amount: exchange ? refundDue : net } : {}),
          })
          .eq("id", ret.id),
      );
      await logAudit(label, "return_request", ret.id, {
        return_number: ret.return_number,
        from_status: ret.status,
        to_status: status ?? ret.status,
        refund_amount: refund,
        refund_deduction: deduct,
      });
    },
    onSuccess: () => {
      toast.success("Return updated");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const label = useMutation({
    mutationFn: async () => {
      const result = await createReturnLabel(ret.id);
      await logAudit("create_label", "return_request", ret.id, { return_number: ret.return_number, cost: result.label_cost });
      return result;
    },
    onSuccess: (result) => {
      toast.success(
        `Label created (cost ${formatPrice(result.label_cost)})${result.deducted ? ", deducted from the refund" : ""}`,
      );
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payPalRefund = useMutation({
    mutationFn: async () => {
      // Save edits (amounts, notes) first: the function refunds what is stored on the return.
      await run(
        db
          .from("return_requests")
          .update({
            customer_message: message.trim(),
            internal_note: note.trim(),
            refund_amount: Number(amount),
            refund_deduction: Number(deduction),
          })
          .eq("id", ret.id),
      );
      const result = await refundReturnWithPayPal(ret.id);
      await logAudit("paypal_refund", "return_request", ret.id, {
        return_number: ret.return_number,
        amount: result.amount,
        reference: result.refund_reference,
      });
      return result;
    },
    onSuccess: (result) => {
      toast.success(`Refunded ${formatPrice(result.amount ?? 0)} in PayPal`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exchangeDone = useMutation({
    mutationFn: async () => {
      await run(
        db
          .from("return_requests")
          .update({ refund_amount: Number(amount), refund_deduction: Number(deduction) })
          .eq("id", ret.id),
      );
      const result = await completeExchange(ret.id);
      await logAudit("create_replacement", "return_request", ret.id, {
        return_number: ret.return_number,
        replacement: result.replacement_order_number,
        settlement: result.settlement_amount,
      });
      return result;
    },
    onSuccess: (result) => {
      toast.success(`Replacement order ${result.replacement_order_number} created`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const creditCard = useMutation({
    mutationFn: async () => {
      const value = Number(creditAmount ?? suggestedCredit);
      if (!(value >= 0)) throw new Error("Enter an amount of 0 or more");
      await creditGiftCardForReturn(ret.id, value);
      await logAudit("credit_gift_card", "return_request", ret.id, { return_number: ret.return_number, amount: value });
    },
    onSuccess: () => {
      toast.success("Gift card part of the refund decided");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restock = useMutation({
    mutationFn: async () => {
      for (const item of ret.return_items) {
        await run(
          db.rpc("adjust_inventory", { p_product_id: item.product_id, p_change: item.quantity, p_reason: "returned" }),
        );
      }
      await run(db.from("return_requests").update({ restocked_at: new Date().toISOString() }).eq("id", ret.id));
      await logAudit("restock", "return_request", ret.id, { return_number: ret.return_number });
    },
    onSuccess: () => {
      toast.success("Items added back to stock");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy =
    update.isPending ||
    restock.isPending ||
    label.isPending ||
    payPalRefund.isPending ||
    exchangeDone.isPending ||
    creditCard.isPending;

  return (
    <div className="border border-border p-5 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="rd-message">Message to the customer</Label>
        <Textarea
          id="rd-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={2000}
          disabled={closed}
          placeholder="Return instructions (address, how to pack), or the reason for a rejection"
        />
        <p className="text-xs text-muted-foreground">
          Shown on the customer's return page and in the approval email. Required to reject.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rd-note">Internal note</Label>
        <Textarea id="rd-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rd-amount">{exchange ? "Credit for returned items (EUR)" : "Items value (EUR)"}</Label>
          <Input
            id="rd-amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={ret.status === "refunded"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rd-deduction">Deduction (EUR)</Label>
          <Input
            id="rd-deduction"
            type="number"
            min={0}
            step="0.01"
            value={deduction}
            onChange={(e) => setDeduction(e.target.value)}
            disabled={ret.status === "refunded"}
          />
        </div>
      </div>

      {canDeductLabel && ret.status !== "refunded" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setDeduction(String(Math.min(ret.label_cost, Number(amount) || 0)))}
        >
          Deduct label cost ({formatPrice(ret.label_cost)})
        </Button>
      )}
      {ret.label_cost > 0 && NO_DEDUCTION_REASONS.includes(ret.reason) && (
        <p className="text-xs text-muted-foreground">
          Defective or wrong item: we bear the return label cost, so it is not deducted.
        </p>
      )}

      <p className="text-sm text-foreground">
        {exchange
          ? `Credit after deduction: ${formatPrice(net)}`
          : `Refund to the customer: ${formatPrice(net)}`}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="rd-ref">PayPal refund ID</Label>
        <Input id="rd-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
        <p className="text-xs text-muted-foreground">Filled in automatically by the PayPal refund. Enter it by hand otherwise.</p>
      </div>

      {cardPaid > 0 && (
        <div className="border border-border p-3 space-y-2 text-sm">
          <p className="text-foreground">Partly paid with a gift card ({formatPrice(cardPaid)})</p>
          {ret.status === "received" && cardPending ? (
            <>
              <p className="text-xs text-muted-foreground">
                Decide how much of this refund goes back to the gift card. PayPal then refunds only the rest
                ({formatPrice(Math.max(refundDue - Number(creditAmount ?? suggestedCredit), 0))}). The suggestion follows
                how the order was paid.
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={creditAmount ?? String(suggestedCredit)}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  aria-label="Amount to credit to the gift card"
                />
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => creditCard.mutate()}>
                  Credit gift card
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {gift?.credited === null
                ? "Mark the parcel as received first, then decide the gift card part of the refund."
                : `${formatPrice(cardCredit)} was credited back to the gift card.`}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ret.status === "requested" && (
          <>
            <Button size="sm" disabled={busy} onClick={() => update.mutate({ status: "approved", label: "approve" })}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => update.mutate({ status: "rejected", label: "reject" })}
            >
              Reject
            </Button>
          </>
        )}
        {ret.status === "approved" && (
          <>
            {!ret.label_created_at && (
              <Button size="sm" disabled={busy} onClick={() => label.mutate()}>
                Create prepaid label
              </Button>
            )}
            <Button
              size="sm"
              variant={ret.label_created_at ? "default" : "outline"}
              disabled={busy}
              onClick={() => update.mutate({ status: "received", label: "receive" })}
            >
              Mark parcel received
            </Button>
          </>
        )}
        {ret.status === "received" && !exchange && (
          <>
            <Button
              size="sm"
              disabled={busy || cardPending || (cardPaid === 0 && net <= 0)}
              onClick={() => {
                if (window.confirm(`Refund ${formatPrice(payPalAmount)} to the customer's PayPal now?`)) payPalRefund.mutate();
              }}
            >
              Refund {formatPrice(payPalAmount)} via PayPal
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || cardPending}
              onClick={() => {
                if (window.confirm(`Have you already refunded ${formatPrice(payPalAmount)} in PayPal by hand? This only records it.`)) {
                  update.mutate({ status: "refunded", label: "refund" });
                }
              }}
            >
              Mark as refunded (done by hand)
            </Button>
          </>
        )}
        {ret.status === "received" && exchange && !ret.replacement_order_id && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Create the replacement order? Stock for the replacement is checked now.")) exchangeDone.mutate();
            }}
          >
            Create replacement order
          </Button>
        )}
        {ret.status === "received" && exchange && ret.replacement_order_id && refundDue > 0 && (
          <>
            <Button
              size="sm"
              disabled={busy || cardPending}
              onClick={() => {
                if (window.confirm(`Refund the difference of ${formatPrice(payPalAmount)} via PayPal now?`)) payPalRefund.mutate();
              }}
            >
              Refund difference {formatPrice(payPalAmount)} via PayPal
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Have you already refunded ${formatPrice(refundDue)} by hand? This only records it.`)) {
                  update.mutate({ status: "refunded", label: "refund" });
                }
              }}
            >
              Mark difference as refunded
            </Button>
          </>
        )}
        {!closed && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => update.mutate({ label: "update" })}>
            Save without changing status
          </Button>
        )}
        {ret.status === "approved" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancel this approved return?")) update.mutate({ status: "cancelled", label: "cancel" });
            }}
          >
            Cancel return
          </Button>
        )}
      </div>

      {(ret.status === "received" || ret.status === "refunded") && (
        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            {ret.restocked_at
              ? `Items were added back to stock on ${formatDateTime(ret.restocked_at)}.`
              : "After inspecting the parcel you can add the returned items back to stock. Used devices and brush heads usually should not be resold."}
          </p>
          {!ret.restocked_at && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Add the returned items back to stock?")) restock.mutate();
              }}
            >
              Put items back in stock
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

const AdminReturnDetail = () => {
  const { returnId = "" } = useParams();
  const queryClient = useQueryClient();

  const { data: ret, isLoading, error } = useQuery({
    queryKey: ["return", returnId],
    queryFn: () => fetchReturn(returnId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["returns"] });
    void queryClient.invalidateQueries({ queryKey: ["return", returnId] });
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading return…</p>;
  if (error || !ret) return <p className="text-sm text-destructive">{error?.message ?? "Return not found"}</p>;

  const order = ret.sales_orders;
  const exchange = ret.resolution === "exchange";
  const replacementValue = ret.return_items.reduce(
    (sum, item) => sum + item.quantity * Number(item.exchange_unit_price ?? 0),
    0,
  );
  const expectedSettlement = replacementValue - refundNet(ret);

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <p className="text-xs text-muted-foreground mb-1">
          <Link to="/admin/returns">Returns</Link>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-light text-foreground">{ret.return_number}</h1>
          <StatusBadge status={ret.status} />
          {exchange && <span className="rounded-full bg-violet-500/10 text-violet-700 px-2 py-0.5 text-[11px]">Exchange</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {ret.customer_name || "—"} · {ret.customer_email} · Requested {formatDate(ret.created_at)}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <div className="border border-border p-5 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ["Reason", RETURN_REASON_LABEL[ret.reason]],
              ["Condition confirmed", ret.condition_confirmed ? "Yes: complete, original packaging" : "No"],
              ["Customer's return tracking", ret.tracking_number || "—"],
              ["Approved", formatDateTime(ret.approved_at)],
              ["Received", formatDateTime(ret.received_at)],
              ["Completed / refunded", formatDateTime(ret.refunded_at)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-foreground break-words">{value}</p>
              </div>
            ))}
            {ret.customer_note && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Customer's note</p>
                <p className="text-foreground whitespace-pre-wrap">{ret.customer_note}</p>
              </div>
            )}
          </div>

          {ret.label_created_at && (
            <div className="border border-border p-4 text-sm space-y-1">
              <p className="text-foreground">Prepaid return label</p>
              <p className="text-xs text-muted-foreground">
                {[ret.label_carrier, ret.label_tracking_number].filter(Boolean).join(" · ") || "Created"} · cost to us{" "}
                {formatPrice(ret.label_cost)} (Sendcloud price list; check your Sendcloud invoice) · created{" "}
                {formatDateTime(ret.label_created_at)}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Items</h2>
            <ul className="border border-border divide-y divide-border text-sm">
              {ret.return_items.map((item) => (
                <li key={item.id} className="p-3 space-y-1">
                  <div className="flex justify-between">
                    <span>
                      {item.quantity} × {item.products?.name ?? "Product"}
                    </span>
                    <span className="text-muted-foreground">{formatPrice(Number(item.unit_price) * item.quantity)}</span>
                  </div>
                  {exchange && item.exchange && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        Replacement: {item.quantity} × {item.exchange.name}
                      </span>
                      <span>{formatPrice(Number(item.exchange_unit_price ?? 0) * item.quantity)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {exchange && (
              <p className="text-xs text-muted-foreground">
                {ret.replacement_order_id
                  ? `Settlement: ${ret.settlement_amount > 0 ? `customer pays ${formatPrice(ret.settlement_amount)}` : ret.settlement_amount < 0 ? `refund ${formatPrice(-ret.settlement_amount)} to the customer` : "even"}.`
                  : `Expected settlement: ${expectedSettlement > 0 ? `customer pays ${formatPrice(expectedSettlement)}` : expectedSettlement < 0 ? `refund ${formatPrice(-expectedSettlement)} to the customer` : "even"} (replacement ${formatPrice(replacementValue)} minus credit ${formatPrice(refundNet(ret))}).`}
              </p>
            )}
            {ret.replacement_order_id && (
              <p className="text-sm">
                <Link to={`/admin/orders/${ret.replacement_order_id}`} className="text-accent">
                  Open the replacement order →
                </Link>
                <span className="block text-xs text-muted-foreground">
                  Ship it like any order from Orders. If the customer owes a difference, mark the order paid once you
                  have collected it.
                </span>
              </p>
            )}
          </div>

          {order && (
            <div className="border border-border p-4 text-sm space-y-1">
              <p>
                <Link to={`/admin/orders/${ret.sales_order_id}`} className="text-accent">
                  Order {order.order_number} →
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                Paid with {order.payment_method || "unknown method"}
                {order.payment_reference && ` (PayPal reference ${order.payment_reference})`}.
              </p>
              {Number(order.balance_due) > 0 && (
                <p className="text-xs text-amber-700">
                  This order had a preorder balance of {formatPrice(Number(order.balance_due))} due at shipping. Check
                  what was actually paid before refunding the full item value.
                </p>
              )}
            </div>
          )}
        </div>

        <Controls ret={ret} onSaved={refresh} />
      </div>
    </div>
  );
};

export default AdminReturnDetail;
