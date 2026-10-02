import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAdminProducts } from "@/lib/catalog";
import { fetchCustomers, parseTags } from "@/lib/customers";
import {
  CODE_STATUS_MESSAGE,
  DRAFT_STATE_LABEL,
  PAYMENT_METHODS,
  addDraftItem,
  createDraft,
  createOrderFromDraft,
  createPaymentLink,
  deleteDraft,
  draftState,
  fetchDraft,
  fetchDraftPricing,
  paymentLinkUrl,
  refreshDraftPrices,
  removeDraftItem,
  updateDraft,
  updateDraftItem,
  type Draft,
  type DraftLanguage,
} from "@/lib/drafts";
import { formatDateTime } from "@/lib/warranty";
import { formatPrice } from "@/data/products";
import { logAudit } from "@/lib/audit";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border border-border p-5 space-y-4">
    <h2 className="text-sm font-medium text-foreground">{title}</h2>
    {children}
  </section>
);

const DraftEditor = ({ draft }: { draft: Draft }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles } = useAdminAuth();
  const canPrice = roles.includes("super_admin") || roles.includes("order_processor");
  const locked = draft.status !== "open" || !!draft.sales_order_id;

  const { data: products = [] } = useQuery({ queryKey: ["admin-products"], queryFn: fetchAdminProducts });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  // Header fields stay local until "Save draft".
  const [name, setName] = useState(draft.customer_name);
  const [email, setEmail] = useState(draft.customer_email);
  const [phone, setPhone] = useState(draft.customer_phone);
  const [language, setLanguage] = useState<DraftLanguage>(draft.language);
  const [customerId, setCustomerId] = useState<string | null>(draft.customer_id);
  const [address, setAddress] = useState(draft.shipping_address.address ?? "");
  const [postalCode, setPostalCode] = useState(draft.shipping_address.postal_code ?? "");
  const [city, setCity] = useState(draft.shipping_address.city ?? "");
  const [country, setCountry] = useState(draft.shipping_address.country ?? "Germany");
  const [shippingLabel, setShippingLabel] = useState(draft.shipping_label);
  const [shippingCost, setShippingCost] = useState(String(draft.shipping_cost));
  const [code, setCode] = useState(draft.discount_code);
  const [customType, setCustomType] = useState<"" | "percent" | "fixed">(draft.custom_discount_type ?? "");
  const [customValue, setCustomValue] = useState(draft.custom_discount_value ? String(draft.custom_discount_value) : "");
  const [customReason, setCustomReason] = useState(draft.custom_discount_reason);
  const [tags, setTags] = useState(draft.tags.join(", "));
  const [notes, setNotes] = useState(draft.notes);
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [linkHours, setLinkHours] = useState("72");
  const [markPaid, setMarkPaid] = useState(false);
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payReference, setPayReference] = useState("");
  const [itemEdits, setItemEdits] = useState<Record<string, { qty?: string; price?: string; reason?: string }>>({});

  const pricingKey = ["draft-pricing", draft.id, draft.updated_at, draft.draft_order_items.length, JSON.stringify(draft.draft_order_items.map((i) => [i.quantity, i.unit_price]))];
  const { data: pricing, error: pricingError } = useQuery({
    queryKey: pricingKey,
    queryFn: () => fetchDraftPricing(draft.id),
    enabled: draft.draft_order_items.length > 0,
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["draft", draft.id] });
    void queryClient.invalidateQueries({ queryKey: ["drafts"] });
  };
  const onError = (e: Error) => toast.error(e.message);

  const matches = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (term.length < 2) return [];
    return customers
      .filter((c) => !c.anonymised_at && (c.email.toLowerCase().includes(term) || c.full_name.toLowerCase().includes(term)))
      .slice(0, 5);
  }, [customers, customerSearch]);

  const addable = useMemo(() => {
    const used = new Set(draft.draft_order_items.map((i) => i.product_id));
    const term = productSearch.trim().toLowerCase();
    return products
      .filter((p) => p.status === "published" && !p.archived_at && !p.preorder_enabled && !used.has(p.id))
      .filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term))
      .slice(0, 8);
  }, [products, draft.draft_order_items, productSearch]);

  const buildPatch = (): Parameters<typeof updateDraft>[1] => {
    const cost = Number(shippingCost);
    if (!(cost >= 0 && cost <= 100)) throw new Error("Shipping cost must be between 0 and 100");
    if (customType) {
      if (!canPrice) throw new Error("Only Super Admins and Order Processors can give a custom discount");
      if (!(Number(customValue) > 0)) throw new Error("Enter the custom discount value");
      if (customType === "percent" && Number(customValue) > 100) throw new Error("A percentage cannot be more than 100");
      if (!customReason.trim()) throw new Error("Give a reason for the custom discount");
    }
    return {
      customer_name: name.trim(),
      customer_email: email.trim().toLowerCase(),
      customer_phone: phone.trim(),
      customer_id: customerId,
      language,
      shipping_address: { address: address.trim(), postal_code: postalCode.trim(), city: city.trim(), country: country.trim() },
      shipping_label: shippingLabel.trim(),
      shipping_cost: cost,
      discount_code: customType ? "" : code.trim(),
      custom_discount_type: customType || null,
      custom_discount_value: customType ? Number(customValue) : 0,
      custom_discount_reason: customType ? customReason.trim() : "",
      tags: parseTags(tags),
      notes: notes.trim(),
    };
  };

  const save = useMutation({
    mutationFn: async () => {
      await updateDraft(draft.id, buildPatch());
      await logAudit("update", "draft_order", draft.id, { draft_number: draft.draft_number });
    },
    onSuccess: () => {
      toast.success("Draft saved");
      refresh();
    },
    onError,
  });

  const addItem = useMutation({
    mutationFn: (productId: string) => addDraftItem(draft.id, productId),
    onSuccess: () => {
      setProductSearch("");
      refresh();
    },
    onError,
  });
  const changeItem = useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof updateDraftItem>[1] }) => updateDraftItem(args.id, args.patch),
    onSuccess: refresh,
    onError,
  });
  const removeItem = useMutation({ mutationFn: removeDraftItem, onSuccess: refresh, onError });
  const refreshPrices = useMutation({
    mutationFn: () => refreshDraftPrices(draft.id),
    onSuccess: () => {
      toast.success("Prices refreshed from the catalogue");
      refresh();
    },
    onError,
  });

  const makeLink = useMutation({
    mutationFn: async () => {
      await updateDraft(draft.id, buildPatch());
      const result = await createPaymentLink(draft.id, Number(linkHours));
      await logAudit("payment_link", "draft_order", draft.id, { draft_number: draft.draft_number, hours: Number(linkHours) });
      return result;
    },
    onSuccess: () => {
      toast.success("Payment link created. Send it to the customer.");
      refresh();
    },
    onError: (e: Error) =>
      toast.error(e.message.startsWith("discount:") ? CODE_STATUS_MESSAGE[e.message.slice(9)] ?? e.message : e.message),
  });

  const createOrder = useMutation({
    mutationFn: async () => {
      await updateDraft(draft.id, buildPatch());
      const result = await createOrderFromDraft(draft.id, markPaid, markPaid ? payMethod : "", markPaid ? payReference : "");
      await logAudit("create_order", "draft_order", draft.id, {
        draft_number: draft.draft_number,
        order_number: result.order_number,
        paid: result.paid,
      });
      return result;
    },
    onSuccess: (result) => {
      toast.success(`Order ${result.order_number} created${result.paid ? " and marked as paid" : ""}`);
      void queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      refresh();
      navigate(`/admin/orders/${result.order_id}`);
    },
    onError: (e: Error) =>
      toast.error(e.message.startsWith("discount:") ? CODE_STATUS_MESSAGE[e.message.slice(9)] ?? e.message : e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteDraft(draft.id),
    onSuccess: () => {
      toast.success("Draft deleted");
      void queryClient.invalidateQueries({ queryKey: ["drafts"] });
      navigate("/admin/orders/drafts");
    },
    onError,
  });

  const duplicate = useMutation({
    mutationFn: async () => {
      const id = await createDraft({
        customer_name: draft.customer_name,
        customer_email: draft.customer_email,
        customer_phone: draft.customer_phone,
        customer_id: draft.customer_id,
        shipping_address: draft.shipping_address,
        language: draft.language,
        shipping_label: draft.shipping_label,
        shipping_cost: draft.shipping_cost,
        tags: draft.tags,
        notes: draft.notes,
      });
      for (const item of draft.draft_order_items) await addDraftItem(id, item.product_id, item.quantity);
      return id;
    },
    onSuccess: (id) => {
      toast.success("Draft duplicated (prices come from the current catalogue)");
      void queryClient.invalidateQueries({ queryKey: ["drafts"] });
      navigate(`/admin/orders/drafts/${id}`);
    },
    onError,
  });

  const busy = save.isPending || makeLink.isPending || createOrder.isPending || remove.isPending || duplicate.isPending;
  const state = draftState(draft);
  const linkUrl = draft.payment_link_token ? paymentLinkUrl(draft.payment_link_token, draft.language) : "";
  const codeProblem = pricing && !customType && draft.discount_code && pricing.code_status && !["applied", "not_combinable"].includes(pricing.code_status);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(linkUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <p className="text-xs text-muted-foreground mb-1">
          <Link to="/admin/orders/drafts">Draft orders</Link>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-light text-foreground">{draft.draft_number}</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{DRAFT_STATE_LABEL[state]}</span>
        </div>
        {locked && draft.sales_order_id && (
          <p className="text-sm mt-2">
            <Link to={`/admin/orders/${draft.sales_order_id}`} className="text-accent">
              Open the order that was created →
            </Link>
            <span className="block text-xs text-muted-foreground">
              This draft is locked. If the customer started paying through the link, mark the order paid once you have
              checked the payment in PayPal.
            </span>
          </p>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_21rem]">
        <fieldset disabled={locked} className="space-y-6 min-w-0">
          <Section title="Customer">
            <div className="space-y-1.5">
              <Label htmlFor="dr-find">Find an existing customer</Label>
              <Input id="dr-find" placeholder="Name or email" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
              {matches.length > 0 && (
                <ul className="border border-border divide-y divide-border text-sm">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full text-left p-2 hover:bg-muted"
                        onClick={() => {
                          setName(c.full_name);
                          setEmail(c.email);
                          setPhone(c.phone || phone);
                          setCustomerId(c.user_id);
                          setCustomerSearch("");
                        }}
                      >
                        {c.full_name || c.email}
                        <span className="block text-xs text-muted-foreground">
                          {c.email} · {c.user_id ? "Account" : "Guest"} · {c.purchases_count} paid order(s)
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dr-name">Name</Label>
                <Input id="dr-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dr-email">Email</Label>
                <Input id="dr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dr-phone">Phone</Label>
                <Input id="dr-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
              </div>
              <div className="space-y-1.5">
                <Label>Language (for emails and the payment page)</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as DraftLanguage)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="vi">Tiếng Việt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dr-address">Delivery address</Label>
              <Input id="dr-address" placeholder="Street and number" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
              <div className="grid grid-cols-3 gap-3">
                <Input placeholder="Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={20} />
                <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} />
                <Input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} />
              </div>
              <p className="text-xs text-muted-foreground">Optional for a payment link: the customer can fill it in on the payment page.</p>
            </div>
          </Section>

          <Section title="Items">
            {draft.draft_order_items.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
            <ul className="divide-y divide-border border border-border text-sm">
              {draft.draft_order_items.map((item) => {
                const edit = itemEdits[item.id] ?? {};
                const short = item.products && item.quantity > item.products.stock;
                return (
                  <li key={item.id} className="p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        <span className="text-foreground">{item.products?.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {item.products?.sku} · catalogue {formatPrice(Number(item.list_price))}
                          {item.on_sale && " (sale price)"} · {item.products?.stock ?? 0} in stock
                        </span>
                        {short && <span className="block text-xs text-amber-700">Only {item.products?.stock} in stock.</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          className="w-20"
                          aria-label="Quantity"
                          value={edit.qty ?? String(item.quantity)}
                          onChange={(e) => setItemEdits((p) => ({ ...p, [item.id]: { ...edit, qty: e.target.value } }))}
                          onBlur={() => {
                            const qty = Math.floor(Number(edit.qty));
                            if (edit.qty !== undefined && qty >= 1 && qty <= 20 && qty !== item.quantity) {
                              changeItem.mutate({ id: item.id, patch: { quantity: qty } });
                            }
                          }}
                        />
                        <span className="w-24 text-right text-foreground">{formatPrice(Number(item.unit_price) * item.quantity)}</span>
                        <button type="button" className="text-xs text-destructive" onClick={() => removeItem.mutate(item.id)}>
                          Remove
                        </button>
                      </span>
                    </div>
                    {canPrice && (
                      <div className="grid sm:grid-cols-[8rem_1fr_auto] gap-2 items-center">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Custom price"
                          aria-label="Custom unit price"
                          value={edit.price ?? (item.custom_price !== null ? String(item.custom_price) : "")}
                          onChange={(e) => setItemEdits((p) => ({ ...p, [item.id]: { ...edit, price: e.target.value } }))}
                        />
                        <Input
                          placeholder="Reason for the custom price"
                          aria-label="Reason for the custom price"
                          maxLength={200}
                          value={edit.reason ?? item.custom_price_reason}
                          onChange={(e) => setItemEdits((p) => ({ ...p, [item.id]: { ...edit, reason: e.target.value } }))}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const raw = edit.price ?? (item.custom_price !== null ? String(item.custom_price) : "");
                            changeItem.mutate({
                              id: item.id,
                              patch: {
                                custom_price: raw.trim() === "" ? null : Number(raw),
                                custom_price_reason: edit.reason ?? item.custom_price_reason,
                              },
                            });
                            setItemEdits((p) => ({ ...p, [item.id]: {} }));
                          }}
                        >
                          Set price
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="space-y-2">
              <Input placeholder="Add a product: search by name or SKU" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
              {productSearch.trim() && (
                <ul className="border border-border divide-y divide-border text-sm">
                  {addable.length === 0 && <li className="p-2 text-muted-foreground">No product found.</li>}
                  {addable.map((p) => (
                    <li key={p.id}>
                      <button type="button" className="w-full text-left p-2 hover:bg-muted flex justify-between" onClick={() => addItem.mutate(p.id)}>
                        <span>
                          {p.name}
                          <span className="text-xs text-muted-foreground"> {p.sku}</span>
                        </span>
                        <span className="text-muted-foreground">
                          {formatPrice(Number(p.sale_price && Number(p.sale_price) < Number(p.price) ? p.sale_price : p.price))} · {p.stock} in stock
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Prices are locked when you add a product. A custom price (never above the catalogue price) needs a reason.
                Preorder products cannot be added to a draft yet.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={refreshPrices.isPending || draft.draft_order_items.length === 0} onClick={() => refreshPrices.mutate()}>
              Refresh prices from the catalogue
            </Button>
          </Section>

          <Section title="Shipping and discount">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dr-ship-label">Shipping method (note)</Label>
                <Input id="dr-ship-label" placeholder="DHL Paket" value={shippingLabel} onChange={(e) => setShippingLabel(e.target.value)} maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dr-ship-cost">Shipping cost (EUR, 0 = free)</Label>
                <Input id="dr-ship-cost" type="number" min={0} max={100} step="0.01" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dr-code">Discount code (optional)</Label>
              <Input id="dr-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} disabled={!!customType} className="font-mono max-w-xs" maxLength={40} />
              <p className="text-xs text-muted-foreground">
                Automatic discounts (for example free shipping from a minimum value) apply on their own. Save the draft
                to see the result.
              </p>
            </div>
            {canPrice && (
              <div className="space-y-2">
                <Label>Custom discount (replaces codes and automatic discounts)</Label>
                <div className="grid sm:grid-cols-[10rem_8rem_1fr] gap-2">
                  <Select value={customType || "none"} onValueChange={(v) => setCustomType(v === "none" ? "" : (v as "percent" | "fixed"))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No custom discount</SelectItem>
                      <SelectItem value="percent">Percentage off</SelectItem>
                      <SelectItem value="fixed">Amount off (EUR)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" min={0} step="0.01" placeholder="Value" disabled={!customType} value={customValue} onChange={(e) => setCustomValue(e.target.value)} />
                  <Input placeholder="Reason (required)" disabled={!customType} value={customReason} onChange={(e) => setCustomReason(e.target.value)} maxLength={200} />
                </div>
              </div>
            )}
          </Section>

          <Section title="Notes and tags">
            <div className="space-y-1.5">
              <Label htmlFor="dr-tags">Tags (comma separated)</Label>
              <Input id="dr-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="phone, wholesale" maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dr-notes">Internal notes</Label>
              <Textarea id="dr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />
            </div>
          </Section>

          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={busy} onClick={() => save.mutate()}>
              Save draft
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => duplicate.mutate()}>
              Duplicate
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Delete this draft?")) remove.mutate();
              }}
            >
              Delete
            </Button>
          </div>
        </fieldset>

        <aside className="space-y-6">
          <div className="border border-border p-5 space-y-3">
            <h2 className="text-sm font-medium text-foreground">Summary</h2>
            {draft.draft_order_items.length === 0 ? (
              <p className="text-xs text-muted-foreground">Add items to see the total.</p>
            ) : pricingError ? (
              <p className="text-xs text-destructive">{pricingError.message}</p>
            ) : !pricing ? (
              <p className="text-xs text-muted-foreground">Calculating…</p>
            ) : (
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Catalogue value</dt>
                  <dd>{formatPrice(pricing.list_total)}</dd>
                </div>
                {pricing.list_total - pricing.subtotal > 0.004 && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>Custom prices</dt>
                    <dd>−{formatPrice(pricing.list_total - pricing.subtotal)}</dd>
                  </div>
                )}
                {pricing.custom_discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>Custom discount</dt>
                    <dd>−{formatPrice(pricing.custom_discount_amount)}</dd>
                  </div>
                )}
                {pricing.applied.filter((d) => d.class !== "shipping").map((d) => (
                  <div key={d.id} className="flex justify-between text-emerald-700">
                    <dt>{d.code ?? d.name}</dt>
                    <dd>−{formatPrice(d.amount)}</dd>
                  </div>
                ))}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping{pricing.free_shipping ? ` (${pricing.free_shipping.name})` : ""}</dt>
                  <dd>{pricing.shipping_cost === 0 ? "Free" : formatPrice(pricing.shipping_cost)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-medium">
                  <dt>Total</dt>
                  <dd>{formatPrice(pricing.total)}</dd>
                </div>
              </dl>
            )}
            {codeProblem && pricing && (
              <p className="text-xs text-destructive">
                Code {draft.discount_code}: {CODE_STATUS_MESSAGE[pricing.code_status ?? ""] ?? "cannot be used"} An order
                cannot be created until you fix or remove it.
              </p>
            )}
            {pricing && pricing.short_stock.length > 0 && (
              <p className="text-xs text-amber-700">
                Not enough stock for: {pricing.short_stock.map((s) => `${s.name} (${s.available} left)`).join(", ")}. The
                order cannot be created until stock is available.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Amounts include VAT. Stock is reserved only when the order is paid.
            </p>
          </div>

          {!locked && (
            <div className="border border-border p-5 space-y-3">
              <h2 className="text-sm font-medium text-foreground">Payment link</h2>
              <p className="text-xs text-muted-foreground">
                The customer opens the link, confirms the address and pays with PayPal. The link is not emailed yet:
                copy it and send it yourself.
              </p>
              <div className="flex gap-2 items-center">
                <Select value={linkHours} onValueChange={setLinkHours}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">Valid 1 day</SelectItem>
                    <SelectItem value="72">Valid 3 days</SelectItem>
                    <SelectItem value="168">Valid 7 days</SelectItem>
                    <SelectItem value="336">Valid 14 days</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" disabled={busy || draft.draft_order_items.length === 0} onClick={() => makeLink.mutate()}>
                  {draft.payment_link_token ? "New link" : "Create link"}
                </Button>
              </div>
              {draft.payment_link_token && (
                <div className="space-y-2">
                  <Input readOnly value={linkUrl} onFocus={(e) => e.currentTarget.select()} className="text-xs font-mono" />
                  <div className="flex items-center gap-3">
                    <Button type="button" size="sm" variant="outline" onClick={copyLink}>
                      Copy link
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {state === "link_expired" ? "Expired" : "Valid until"} {formatDateTime(draft.payment_link_expires_at)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">A new link makes the old one stop working.</p>
                </div>
              )}
            </div>
          )}

          {!locked && (
            <div className="border border-border p-5 space-y-3">
              <h2 className="text-sm font-medium text-foreground">Create the order</h2>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
                The customer has already paid
              </label>
              {markPaid ? (
                <div className="space-y-2">
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Payment reference (optional)" value={payReference} onChange={(e) => setPayReference(e.target.value)} maxLength={120} />
                  <p className="text-xs text-muted-foreground">Marking it paid reserves the stock now.</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The order is created unpaid and waits for payment. Stock is reserved when you mark it paid.
                </p>
              )}
              <Button
                type="button"
                className="w-full"
                disabled={busy || draft.draft_order_items.length === 0}
                onClick={() => {
                  if (window.confirm(markPaid ? "Create the order and mark it as paid?" : "Create the order (unpaid)?")) createOrder.mutate();
                }}
              >
                Create order
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

const AdminDraftDetail = () => {
  const { draftId = "" } = useParams();
  const navigate = useNavigate();
  const creating = useRef(false);
  const isNew = draftId === "new";

  // "Create draft" opens /orders/drafts/new: make the draft, then show its editor.
  useEffect(() => {
    if (!isNew || creating.current) return;
    creating.current = true;
    createDraft()
      .then((id) => navigate(`/admin/orders/drafts/${id}`, { replace: true }))
      .catch((e: Error) => {
        toast.error(e.message);
        navigate("/admin/orders/drafts", { replace: true });
      });
  }, [isNew, navigate]);

  const { data: draft, isLoading, error } = useQuery({
    queryKey: ["draft", draftId],
    queryFn: () => fetchDraft(draftId),
    enabled: !isNew,
  });

  if (isNew || isLoading) return <p className="text-sm text-muted-foreground">Loading draft…</p>;
  if (error || !draft) return <p className="text-sm text-destructive">{error?.message ?? "Draft not found"}</p>;
  // Remount the editor when the saved draft changes so the form shows what was saved.
  return <DraftEditor key={`${draft.id}-${draft.updated_at}`} draft={draft} />;
};

export default AdminDraftDetail;
