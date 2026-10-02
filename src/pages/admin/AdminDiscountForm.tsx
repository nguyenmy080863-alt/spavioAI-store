import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAdminProducts } from "@/lib/catalog";
import {
  ELIGIBILITY_LABEL,
  deleteDiscount,
  fetchDiscount,
  generateCode,
  saveDiscount,
  shareLink,
  type Discount,
  type DiscountAppliesTo,
  type DiscountEligibility,
  type DiscountMethod,
  type DiscountType,
} from "@/lib/discounts";
import { CATEGORIES } from "@/data/products";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const toLocalInput = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border border-border p-5 space-y-4">
    <h2 className="text-sm font-medium text-foreground">{title}</h2>
    {children}
  </section>
);

const toggle = <T,>(list: T[], item: T, set: (next: T[]) => void) =>
  set(list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item]);

interface TargetPickerProps {
  appliesTo: DiscountAppliesTo;
  onAppliesTo: (value: DiscountAppliesTo) => void;
  productIds: string[];
  onProducts: (value: string[]) => void;
  categories: string[];
  onCategories: (value: string[]) => void;
  products: { id: string; name: string; sku: string }[];
  orderLabel: string;
}

/** Whole order / categories / products chooser, used for the "applies to" and the "get" sets. */
const TargetPicker = ({
  appliesTo,
  onAppliesTo,
  productIds,
  onProducts,
  categories,
  onCategories,
  products,
  orderLabel,
}: TargetPickerProps) => {
  const [search, setSearch] = useState("");
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
  }, [products, search]);

  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <Select value={appliesTo} onValueChange={(next) => onAppliesTo(next as DiscountAppliesTo)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="order">{orderLabel}</SelectItem>
            <SelectItem value="categories">Specific categories</SelectItem>
            <SelectItem value="products">Specific products</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {appliesTo === "categories" && (
        <div className="space-y-2">
          {CATEGORIES.map((category) => (
            <label key={category} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={categories.includes(category)}
                onChange={() => toggle(categories, category, onCategories)}
              />
              {category}
            </label>
          ))}
        </div>
      )}
      {appliesTo === "products" && (
        <div className="space-y-2">
          <Input placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="max-h-48 overflow-y-auto border border-border divide-y divide-border">
            {shown.map((product) => (
              <label key={product.id} className="flex items-center gap-2 p-2 text-sm">
                <input
                  type="checkbox"
                  checked={productIds.includes(product.id)}
                  onChange={() => toggle(productIds, product.id, onProducts)}
                />
                {product.name}
                <span className="text-xs text-muted-foreground">{product.sku}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{productIds.length} selected</p>
        </div>
      )}
    </div>
  );
};

const AdminDiscountForm = () => {
  const { discountId = "new" } = useParams();
  const isNew = discountId === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // The customer page links here to create a personal code (?email=…&name=…).
  const [prefill] = useSearchParams();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["discount", discountId],
    queryFn: () => fetchDiscount(discountId),
    enabled: !isNew,
  });
  const { data: products = [] } = useQuery({ queryKey: ["admin-products"], queryFn: fetchAdminProducts });

  const personalEmail = isNew ? (prefill.get("email") ?? "") : "";

  const [name, setName] = useState(personalEmail ? `Personal code for ${prefill.get("name") || personalEmail}` : "");
  const [method, setMethod] = useState<DiscountMethod>("code");
  const [code, setCode] = useState(personalEmail ? generateCode() : "");
  const [type, setType] = useState<DiscountType>("percent");
  const [value, setValue] = useState("10");
  const [appliesTo, setAppliesTo] = useState<DiscountAppliesTo>("order");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [buyQuantity, setBuyQuantity] = useState("2");
  const [getQuantity, setGetQuantity] = useState("1");
  const [getSame, setGetSame] = useState(true);
  const [getAppliesTo, setGetAppliesTo] = useState<DiscountAppliesTo>("products");
  const [getProductIds, setGetProductIds] = useState<string[]>([]);
  const [getCategories, setGetCategories] = useState<string[]>([]);
  const [getMax, setGetMax] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("0");
  const [minQuantity, setMinQuantity] = useState("0");
  const [excludeSale, setExcludeSale] = useState(true);
  const [eligibility, setEligibility] = useState<DiscountEligibility>("all");
  const [segmentSpent, setSegmentSpent] = useState("500");
  const [segmentDays, setSegmentDays] = useState("180");
  const [segmentTag, setSegmentTag] = useState("");
  const [customerEmail, setCustomerEmail] = useState(personalEmail);
  const [usageLimit, setUsageLimit] = useState(personalEmail ? "1" : "");
  const [oncePerCustomer, setOncePerCustomer] = useState(Boolean(personalEmail));
  const [combineProduct, setCombineProduct] = useState(false);
  const [combineOrder, setCombineOrder] = useState(false);
  const [combineShipping, setCombineShipping] = useState(true);
  const [startsAt, setStartsAt] = useState(toLocalInput(new Date().toISOString()));
  const [endsAt, setEndsAt] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setMethod(existing.method);
    setCode(existing.code ?? "");
    setType(existing.type);
    setValue(String(existing.value));
    setAppliesTo(existing.applies_to);
    setProductIds(existing.product_ids);
    setCategories(existing.categories);
    setBuyQuantity(String(existing.buy_quantity));
    setGetQuantity(String(existing.get_quantity));
    setGetSame(existing.get_same_as_buy);
    setGetAppliesTo(existing.get_applies_to);
    setGetProductIds(existing.get_product_ids);
    setGetCategories(existing.get_categories);
    setGetMax(existing.get_max_units === null ? "" : String(existing.get_max_units));
    setMinSubtotal(String(existing.min_subtotal));
    setMinQuantity(String(existing.min_quantity));
    setExcludeSale(existing.exclude_sale_items);
    setEligibility(existing.eligibility);
    setSegmentSpent(String(existing.segment_min_spent));
    setSegmentDays(String(existing.segment_days));
    setSegmentTag(existing.segment_tag);
    setCustomerEmail(existing.customer_email ?? "");
    setUsageLimit(existing.usage_limit === null ? "" : String(existing.usage_limit));
    setOncePerCustomer(existing.once_per_customer);
    setCombineProduct(existing.combine_product);
    setCombineOrder(existing.combine_order);
    setCombineShipping(existing.combine_shipping);
    setStartsAt(toLocalInput(existing.starts_at));
    setEndsAt(toLocalInput(existing.ends_at));
    setActive(existing.active);
  }, [existing]);

  // Free shipping used to stack with everything; keep that as the starting point for new ones.
  useEffect(() => {
    if (!isNew) return;
    if (type === "free_shipping") {
      setCombineProduct(true);
      setCombineOrder(true);
    }
  }, [type, isNew]);

  const isShipping = type === "free_shipping";
  const isBxgy = type === "buy_x_get_y";
  const targetsSet = !isShipping && appliesTo !== "order";

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Give the discount a name");
      const cleanCode = code.trim().replace(/\s+/g, "");
      if (method === "code" && cleanCode.length < 3) throw new Error("Enter a code of at least 3 characters");
      const amount = isShipping ? 0 : Number(value);
      if (!isShipping && !(amount > 0)) throw new Error(isBxgy ? "Enter the discount on the reward items (100 = free)" : "Enter a discount value greater than 0");
      if ((type === "percent" || isBxgy) && amount > 100) throw new Error("A percentage cannot be more than 100");
      if (!isShipping && appliesTo === "products" && productIds.length === 0) throw new Error("Choose at least one product");
      if (!isShipping && appliesTo === "categories" && categories.length === 0) throw new Error("Choose at least one category");
      if (isBxgy && !getSame && getAppliesTo === "products" && getProductIds.length === 0) {
        throw new Error("Choose the products the customer gets");
      }
      if (isBxgy && !getSame && getAppliesTo === "categories" && getCategories.length === 0) {
        throw new Error("Choose the categories the customer gets");
      }
      if (isBxgy && (!(Number(buyQuantity) >= 1) || !(Number(getQuantity) >= 1))) {
        throw new Error("Buy and get quantities must be at least 1");
      }
      if (eligibility === "tag" && !segmentTag.trim()) throw new Error("Enter the customer tag");
      const email = customerEmail.trim().toLowerCase();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid customer email");
      if (email && method !== "code") throw new Error("Only a discount code can be personal");
      const starts = new Date(startsAt);
      const ends = endsAt ? new Date(endsAt) : null;
      if (Number.isNaN(starts.getTime())) throw new Error("Enter a valid start date");
      if (ends && ends <= starts) throw new Error("The end date must be after the start date");

      const values: Omit<Discount, "id" | "created_at"> = {
        name: name.trim(),
        method,
        code: method === "code" ? cleanCode : null,
        type,
        value: amount,
        applies_to: isShipping ? "order" : appliesTo,
        product_ids: targetsSet && appliesTo === "products" ? productIds : [],
        categories: targetsSet && appliesTo === "categories" ? categories : [],
        buy_quantity: isBxgy ? Math.floor(Number(buyQuantity)) : 1,
        get_quantity: isBxgy ? Math.floor(Number(getQuantity)) : 1,
        get_same_as_buy: isBxgy ? getSame : true,
        get_applies_to: getAppliesTo,
        get_product_ids: isBxgy && !getSame && getAppliesTo === "products" ? getProductIds : [],
        get_categories: isBxgy && !getSame && getAppliesTo === "categories" ? getCategories : [],
        get_max_units: isBxgy && getMax.trim() !== "" ? Math.max(Math.floor(Number(getMax)), 1) : null,
        min_subtotal: Number(minSubtotal) || 0,
        min_quantity: Math.floor(Number(minQuantity)) || 0,
        exclude_sale_items: excludeSale,
        eligibility,
        segment_min_spent: eligibility === "high_spenders" ? Number(segmentSpent) || 0 : 0,
        segment_days: eligibility === "lapsed" ? Math.max(Math.floor(Number(segmentDays)) || 180, 1) : 180,
        segment_tag: eligibility === "tag" ? segmentTag.trim().toLowerCase() : "",
        customer_email: email || null,
        usage_limit: usageLimit.trim() === "" ? null : Math.max(Math.floor(Number(usageLimit)), 1),
        once_per_customer: oncePerCustomer,
        combine_product: combineProduct,
        combine_order: combineOrder,
        combine_shipping: combineShipping,
        starts_at: starts.toISOString(),
        ends_at: ends ? ends.toISOString() : null,
        active,
      };
      const id = await saveDiscount(isNew ? null : discountId, values);
      await logAudit(isNew ? "create" : "update", "discount", id, { name: values.name, method, type });
      return id;
    },
    onSuccess: () => {
      toast.success("Discount saved");
      void queryClient.invalidateQueries({ queryKey: ["discounts"] });
      void queryClient.invalidateQueries({ queryKey: ["discount", discountId] });
      navigate("/admin/discounts");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await deleteDiscount(discountId);
      await logAudit("delete", "discount", discountId, { name });
    },
    onSuccess: () => {
      toast.success("Discount deleted");
      void queryClient.invalidateQueries({ queryKey: ["discounts"] });
      navigate("/admin/discounts");
    },
    onError: (e: Error) =>
      toast.error(
        /foreign key|violates/i.test(e.message)
          ? "This discount was already used on orders, so it cannot be deleted. Switch it off instead."
          : e.message,
      ),
  });

  if (!isNew && isLoading) return <p className="text-sm text-muted-foreground">Loading discount…</p>;

  const typeClass = isShipping ? "shipping" : isBxgy || appliesTo !== "order" ? "product" : "order";

  return (
    <form
      className="space-y-6 max-w-3xl"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <p className="text-xs text-muted-foreground mb-1">
          <Link to="/admin/discounts">Discounts</Link>
        </p>
        <h1 className="text-xl font-light text-foreground">{isNew ? "Create discount" : name || "Edit discount"}</h1>
      </div>

      <Section title="How customers get it">
        <div className="space-y-1.5">
          <Label htmlFor="d-name">Name (for your team)</Label>
          <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="flex gap-6 text-sm">
          {(["code", "automatic"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="method" checked={method === value} onChange={() => setMethod(value)} />
              {value === "code" ? "Discount code" : "Automatic discount"}
            </label>
          ))}
        </div>
        {method === "code" ? (
          <div className="space-y-1.5">
            <Label htmlFor="d-code">Code</Label>
            <div className="flex gap-2">
              <Input
                id="d-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="font-mono"
                maxLength={40}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setCode(generateCode())}>
                Generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Codes are not case sensitive. Use a hard-to-guess code for private campaigns.
              {code.trim() && (
                <>
                  {" "}
                  Share link: <span className="font-mono">{shareLink(code.trim())}</span> (opens the shop and applies the
                  code at checkout).
                </>
              )}
            </p>
            <div className="space-y-1.5 pt-2">
              <Label htmlFor="d-email">Personal code: only for this customer (optional)</Label>
              <Input
                id="d-email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                maxLength={255}
              />
              <p className="text-xs text-muted-foreground">
                The code only works when this email is used at checkout. Pair it with "Total uses = 1" for a one-time gift.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Applies by itself when the bag meets the conditions below. Customers do not enter anything.
          </p>
        )}
      </Section>

      <Section title="What it gives">
        <div className="flex flex-wrap gap-6 text-sm">
          {(
            [
              ["percent", "Percentage off"],
              ["fixed", "Fixed amount off"],
              ["buy_x_get_y", "Buy X Get Y"],
              ["free_shipping", "Free shipping"],
            ] as const
          ).map(([option, label]) => (
            <label key={option} className="flex items-center gap-2">
              <input type="radio" name="type" checked={type === option} onChange={() => setType(option)} />
              {label}
            </label>
          ))}
        </div>

        {!isShipping && !isBxgy && (
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="d-value">{type === "percent" ? "Percentage (1–100)" : "Amount (EUR)"}</Label>
            <Input
              id="d-value"
              type="number"
              min={0}
              step={type === "percent" ? "1" : "0.01"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {type === "fixed" && (
              <p className="text-xs text-muted-foreground">
                Taken off the eligible items once per order (never more than their value).
              </p>
            )}
          </div>
        )}

        {isBxgy && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 max-w-md">
              <div className="space-y-1.5">
                <Label htmlFor="d-buy">Customer buys</Label>
                <Input id="d-buy" type="number" min={1} step="1" value={buyQuantity} onChange={(e) => setBuyQuantity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-get">and gets</Label>
                <Input id="d-get" type="number" min={1} step="1" value={getQuantity} onChange={(e) => setGetQuantity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-off">% off the reward</Label>
                <Input id="d-off" type="number" min={1} max={100} step="1" value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">100 % off means free. The cheapest eligible reward items are the ones discounted.</p>
          </div>
        )}

        {!isShipping && (
          <div className="space-y-2">
            <Label>{isBxgy ? "Items the customer must buy" : "Applies to"}</Label>
            <TargetPicker
              appliesTo={appliesTo}
              onAppliesTo={setAppliesTo}
              productIds={productIds}
              onProducts={setProductIds}
              categories={categories}
              onCategories={setCategories}
              products={products}
              orderLabel={isBxgy ? "Any items" : "The entire order"}
            />
          </div>
        )}

        {isBxgy && (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={getSame} onChange={(e) => setGetSame(e.target.checked)} />
              <span>
                The reward items come from the same items as the ones bought
                <span className="block text-xs text-muted-foreground">
                  Example: buy 2 get 1 free of the same product. Untick to reward different items, for example a free
                  gel when a device is bought. Choose clearly different sets then.
                </span>
              </span>
            </label>
            {!getSame && (
              <div className="space-y-2">
                <Label>Reward items</Label>
                <TargetPicker
                  appliesTo={getAppliesTo}
                  onAppliesTo={setGetAppliesTo}
                  productIds={getProductIds}
                  onProducts={setGetProductIds}
                  categories={getCategories}
                  onCategories={setGetCategories}
                  products={products}
                  orderLabel="Any items"
                />
              </div>
            )}
            <div className="space-y-1.5 max-w-xs">
              <Label htmlFor="d-getmax">Most reward items per order (optional)</Label>
              <Input id="d-getmax" type="number" min={1} step="1" value={getMax} onChange={(e) => setGetMax(e.target.value)} />
            </div>
          </div>
        )}
      </Section>

      <Section title="Conditions">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="d-min">{isShipping ? "Minimum bag value (EUR)" : "Minimum spend on eligible items (EUR)"}</Label>
            <Input id="d-min" type="number" min={0} step="0.01" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} />
            {isShipping && <p className="text-xs text-muted-foreground">Measured after any discount. Use 0 for always free shipping.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-minq">Minimum number of items (0 = none)</Label>
            <Input id="d-minq" type="number" min={0} step="1" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} />
          </div>
        </div>
        {!isShipping && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={excludeSale} onChange={(e) => setExcludeSale(e.target.checked)} />
            <span>
              Do not apply to products that are already on sale
              <span className="block text-xs text-muted-foreground">
                Example: a device is €200, on sale for €160. With this ticked, a 10 % code leaves it at €160. Untick it
                to stack: €144. Preorder items never get discounts.
              </span>
            </span>
          </label>
        )}
      </Section>

      <Section title="Who and how often">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Customers</Label>
            <Select value={eligibility} onValueChange={(next) => setEligibility(next as DiscountEligibility)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ELIGIBILITY_LABEL) as DiscountEligibility[]).map((option) => (
                  <SelectItem key={option} value={option}>
                    {ELIGIBILITY_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-limit">Total uses (empty = unlimited)</Label>
            <Input id="d-limit" type="number" min={1} step="1" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
          </div>
        </div>
        {eligibility === "high_spenders" && (
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="d-spent">Total spent of at least (EUR)</Label>
            <Input id="d-spent" type="number" min={0} step="1" value={segmentSpent} onChange={(e) => setSegmentSpent(e.target.value)} />
          </div>
        )}
        {eligibility === "lapsed" && (
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="d-days">No purchase in the last (days)</Label>
            <Input id="d-days" type="number" min={1} step="1" value={segmentDays} onChange={(e) => setSegmentDays(e.target.value)} />
          </div>
        )}
        {eligibility === "tag" && (
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="d-tag">Customer tag</Label>
            <Input id="d-tag" value={segmentTag} onChange={(e) => setSegmentTag(e.target.value)} placeholder="vip" maxLength={40} />
            <p className="text-xs text-muted-foreground">Tags are set on the customer page.</p>
          </div>
        )}
        {eligibility !== "all" && (
          <p className="text-xs text-muted-foreground">
            Customer rules are matched by the email used at checkout, so they also work for guests. They are checked
            when the order is placed.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={oncePerCustomer} onChange={(e) => setOncePerCustomer(e.target.checked)} />
          Once per customer (matched by email, so it also works for guests)
        </label>
      </Section>

      <Section title="Combinations">
        <p className="text-xs text-muted-foreground">
          This discount is in the <strong className="text-foreground">{typeClass}</strong> class. Two discounts of the same
          class never combine. A discount of another class combines with this one only if both allow it. Product
          discounts are applied first, order discounts on what is left.
        </p>
        <div className="space-y-2 text-sm">
          {typeClass !== "product" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={combineProduct} onChange={(e) => setCombineProduct(e.target.checked)} />
              Can combine with product discounts (chosen products or categories, Buy X Get Y)
            </label>
          )}
          {typeClass !== "order" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={combineOrder} onChange={(e) => setCombineOrder(e.target.checked)} />
              Can combine with whole-order discounts
            </label>
          )}
          {typeClass !== "shipping" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={combineShipping} onChange={(e) => setCombineShipping(e.target.checked)} />
              Can combine with free shipping
            </label>
          )}
        </div>
      </Section>

      <Section title="Active period">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="d-start">Starts</Label>
            <Input id="d-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-end">Ends (optional)</Label>
            <Input id="d-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Switched on
        </label>
      </Section>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={save.isPending}>
          Save discount
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/admin/discounts">Cancel</Link>
        </Button>
        {!isNew && (
          <Button
            type="button"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm("Delete this discount? Discounts already used on orders cannot be deleted.")) remove.mutate();
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
};

export default AdminDiscountForm;
