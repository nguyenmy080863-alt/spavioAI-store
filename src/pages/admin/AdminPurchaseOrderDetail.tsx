import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAdminProducts } from "@/lib/catalog";
import { db, fetchPurchaseOrder, formatDate, run, type PurchaseOrderStatus } from "@/lib/orders";
import { logAudit } from "@/lib/audit";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "@/components/admin/StatusBadge";
import LineItemsEditor, { parseLines, type Line } from "@/components/admin/LineItemsEditor";

const AdminPurchaseOrderDetail = () => {
  const { poId = "" } = useParams();
  const isNew = poId === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canManageProducts } = useAdminAuth();

  const [supplier, setSupplier] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: "1", price: "0" }]);
  const [received, setReceived] = useState<Record<string, string>>({});

  const { data: products = [] } = useQuery({ queryKey: ["admin-products"], queryFn: fetchAdminProducts });
  const { data: order, isLoading, error } = useQuery({
    queryKey: ["purchase-order", poId],
    queryFn: () => fetchPurchaseOrder(poId),
    enabled: !isNew,
  });

  useEffect(() => {
    if (!order) return;
    setSupplier(order.supplier_name);
    setExpected(order.expected_date ?? "");
    setNotes(order.notes);
    setLines(
      order.purchase_order_items.map((item) => ({
        product_id: item.product_id,
        quantity: String(item.quantity_ordered),
        price: String(item.unit_cost),
      })),
    );
    setReceived(
      Object.fromEntries(order.purchase_order_items.map((item) => [item.id, String(item.quantity_received)])),
    );
  }, [order]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["purchase-order", poId] });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  const insertLines = async (id: string, parsed: { product_id: string; quantity: number; price: number }[]) =>
    run(
      db.from("purchase_order_items").insert(
        parsed.map((line) => ({
          purchase_order_id: id,
          product_id: line.product_id,
          quantity_ordered: line.quantity,
          unit_cost: line.price,
        })),
      ),
    );

  const save = useMutation({
    mutationFn: async () => {
      if (!supplier.trim()) throw new Error("Enter a supplier");
      const result = parseLines(lines);
      if ("error" in result) throw new Error(result.error);
      const fields = { supplier_name: supplier.trim(), expected_date: expected || null, notes };

      if (isNew) {
        const { data, error: insertError } = await db.from("purchase_orders").insert(fields).select("id").single();
        if (insertError) throw new Error(insertError.message);
        await insertLines(data.id, result.lines);
        await logAudit("create", "purchase_order", data.id, { supplier: fields.supplier_name });
        return data.id as string;
      }
      await run(db.from("purchase_orders").update(fields).eq("id", poId));
      await run(db.from("purchase_order_items").delete().eq("purchase_order_id", poId));
      await insertLines(poId, result.lines);
      return poId;
    },
    onSuccess: (id) => {
      toast.success("Purchase order saved");
      refresh();
      if (isNew) navigate(`/admin/products/purchase-orders/${id}`, { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (next: PurchaseOrderStatus) => {
      if (!order) return;
      // Record what actually arrived before the order changes state.
      const changed = order.purchase_order_items.filter((item) => {
        const value = received[item.id];
        return value !== undefined && Number(value) !== item.quantity_received;
      });
      for (const item of changed) {
        const quantity = Number(received[item.id]);
        if (!Number.isInteger(quantity) || quantity < 0) throw new Error("Received quantities must be 0 or more");
        await run(db.from("purchase_order_items").update({ quantity_received: quantity }).eq("id", item.id));
      }
      if (next !== order.status) {
        await run(db.from("purchase_orders").update({ status: next }).eq("id", order.id));
        await logAudit("status_change", "purchase_order", order.id, { from: order.status, to: next });
      }
    },
    onSuccess: () => {
      toast.success("Purchase order updated");
      refresh();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      refresh();
    },
  });

  if (!isNew && isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!isNew && (error || !order)) {
    return <p className="text-sm text-destructive">{error?.message ?? "Purchase order not found"}</p>;
  }

  const status = order?.status ?? "draft";
  const isDraft = status === "draft";
  const canReceive = status === "ordered" || status === "partially_received";
  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.price) || 0), 0);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <p className="text-xs text-muted-foreground mb-1">
          <Link to="/admin/products/purchase-orders">Purchase orders</Link>
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-light text-foreground">{order?.po_number ?? "New purchase order"}</h1>
          {order && <StatusBadge status={order.status} />}
        </div>
        {order && (
          <p className="text-xs text-muted-foreground mt-1">
            Created {formatDate(order.created_at)} · Ordered {formatDate(order.ordered_at)}
            {order.received_at ? ` · Closed ${formatDate(order.received_at)}` : ""}
          </p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm text-foreground">Details</h2>
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Supplier"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            disabled={!isDraft || !canManageProducts}
            className="max-w-xs"
            maxLength={120}
          />
          <Input
            type="date"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            disabled={!isDraft || !canManageProducts}
            className="w-44"
            aria-label="Expected date"
          />
        </div>
        <Textarea
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!isDraft || !canManageProducts}
          maxLength={1000}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-foreground">Products</h2>
        {isDraft || isNew ? (
          <>
            <LineItemsEditor
              products={products.filter((p) => !p.archived_at)}
              lines={lines}
              onChange={setLines}
              priceLabel="Unit cost"
              defaultPrice={() => 0}
              disabled={!canManageProducts}
            />
            <p className="text-xs text-muted-foreground">Total cost: {total.toFixed(2)}</p>
          </>
        ) : (
          <div className="border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
                  <th className="p-3">Product</th>
                  <th className="p-3">Ordered</th>
                  <th className="p-3">Received</th>
                  <th className="p-3">Unit cost</th>
                </tr>
              </thead>
              <tbody>
                {order?.purchase_order_items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="p-3 text-foreground">
                      {item.products?.name} <span className="text-muted-foreground">({item.products?.sku})</span>
                    </td>
                    <td className="p-3 text-muted-foreground">{item.quantity_ordered}</td>
                    <td className="p-3">
                      {canReceive && canManageProducts ? (
                        <Input
                          type="number"
                          min={0}
                          value={received[item.id] ?? ""}
                          onChange={(e) => setReceived((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="h-8 w-24"
                          aria-label={`Received ${item.products?.name}`}
                        />
                      ) : (
                        <span className="text-muted-foreground">{item.quantity_received}</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{Number(item.unit_cost).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canReceive && (
          <p className="text-xs text-muted-foreground">
            Enter what actually arrived. Closing as received releases anything still missing from incoming stock.
          </p>
        )}
      </section>

      {canManageProducts && (
        <div className="flex flex-wrap gap-3">
          {(isDraft || isNew) && (
            <>
              <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
                {isNew ? "Create draft" : "Save draft"}
              </Button>
              {!isNew && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={setStatus.isPending}
                  onClick={() => {
                    if (window.confirm("Place this order? Quantities will count as incoming stock and can no longer be edited.")) {
                      setStatus.mutate("ordered");
                    }
                  }}
                >
                  Place order
                </Button>
              )}
            </>
          )}
          {canReceive && (
            <>
              <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate(status)}>
                Save received quantities
              </Button>
              {status === "ordered" && (
                <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate("partially_received")}>
                  Mark partially received
                </Button>
              )}
              <Button size="sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate("received")}>
                Close as received
              </Button>
            </>
          )}
          {(isDraft || canReceive) && !isNew && (
            <Button
              size="sm"
              variant="destructive"
              disabled={setStatus.isPending}
              onClick={() => {
                if (window.confirm("Cancel this purchase order?")) setStatus.mutate("cancelled");
              }}
            >
              Cancel order
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPurchaseOrderDetail;
