import { db, run } from "@/lib/orders";
import type { CartItem } from "@/context/CartContext";

export type DiscountMethod = "code" | "automatic";
export type DiscountType = "percent" | "fixed" | "free_shipping" | "buy_x_get_y";
export type DiscountAppliesTo = "order" | "products" | "categories";
export type DiscountEligibility = "all" | "new_customers" | "returning" | "high_spenders" | "lapsed" | "tag";

export const ELIGIBILITY_LABEL: Record<DiscountEligibility, string> = {
  all: "Everyone",
  new_customers: "New customers only (no earlier paid order)",
  returning: "Returning customers (at least one earlier paid order)",
  high_spenders: "High spenders (spent at least an amount)",
  lapsed: "Lapsed customers (bought before, but not recently)",
  tag: "Customers with a tag",
};

export interface Discount {
  id: string;
  name: string;
  method: DiscountMethod;
  code: string | null;
  type: DiscountType;
  value: number;
  applies_to: DiscountAppliesTo;
  product_ids: string[];
  categories: string[];
  min_subtotal: number;
  min_quantity: number;
  exclude_sale_items: boolean;
  eligibility: DiscountEligibility;
  usage_limit: number | null;
  once_per_customer: boolean;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  // Buy X Get Y
  buy_quantity: number;
  get_quantity: number;
  get_same_as_buy: boolean;
  get_applies_to: DiscountAppliesTo;
  get_product_ids: string[];
  get_categories: string[];
  get_max_units: number | null;
  // Customer segments
  segment_min_spent: number;
  segment_days: number;
  segment_tag: string;
  // Personal code: only this customer can use it
  customer_email: string | null;
  // Combinations
  combine_product: boolean;
  combine_order: boolean;
  combine_shipping: boolean;
}

export interface DiscountStats {
  discount_id: string;
  uses: number;
  amount_given: number;
  revenue: number;
}

export type DiscountRow = Discount & Omit<DiscountStats, "discount_id">;

export type DiscountStatus = "active" | "scheduled" | "expired" | "inactive" | "used_up";

export const DISCOUNT_STATUS_LABEL: Record<DiscountStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  inactive: "Switched off",
  used_up: "Used up",
};

export const discountStatus = (d: DiscountRow, now = Date.now()): DiscountStatus => {
  if (!d.active) return "inactive";
  if (new Date(d.starts_at).getTime() > now) return "scheduled";
  if (d.ends_at && new Date(d.ends_at).getTime() < now) return "expired";
  if (d.usage_limit !== null && d.uses >= d.usage_limit) return "used_up";
  return "active";
};

const eur = (value: number) => `€${Number(value).toFixed(2).replace(/\.00$/, "")}`;

/** One-line summary, for example "10% off the order" or "Buy 2 get 1 free". */
export const describeDiscount = (d: Discount, productNames: Record<string, string> = {}) => {
  const target = (appliesTo: DiscountAppliesTo, ids: string[], categories: string[], fallback: string) =>
    appliesTo === "order"
      ? fallback
      : appliesTo === "categories"
        ? categories.join(", ") || "selected categories"
        : ids.map((id) => productNames[id] ?? "product").join(", ") || "selected products";

  if (d.type === "free_shipping") {
    return d.min_subtotal > 0 ? `Free shipping from ${eur(d.min_subtotal)}` : "Free shipping";
  }
  if (d.type === "buy_x_get_y") {
    const reward = Number(d.value) >= 100 ? "free" : `${Number(d.value)}% off`;
    const buy = target(d.applies_to, d.product_ids, d.categories, "any items");
    const get = d.get_same_as_buy ? "the same" : target(d.get_applies_to, d.get_product_ids, d.get_categories, "any items");
    return `Buy ${d.buy_quantity} (${buy}), get ${d.get_quantity} of ${get} ${reward}`;
  }
  const amount = d.type === "percent" ? `${Number(d.value)}%` : eur(d.value);
  return `${amount} off ${target(d.applies_to, d.product_ids, d.categories, "the order")}`;
};

/** Customer-facing share link: opening it remembers the code and applies it at checkout. */
export const shareLink = (code: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/discount/${encodeURIComponent(code)}`;

/** A readable random code such as "GLOW-7K2Q". */
export const generateCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `GLOW-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
};

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const fetchDiscounts = async (): Promise<DiscountRow[]> => {
  const [discounts, stats] = await Promise.all([
    db.from("discounts").select("*").order("created_at", { ascending: false }),
    db.from("discount_stats").select("*"),
  ]);
  const byId = new Map(unwrap<DiscountStats[]>(stats).map((s) => [s.discount_id, s]));
  return unwrap<Discount[]>(discounts).map((discount) => {
    const stat = byId.get(discount.id);
    return {
      ...discount,
      value: Number(discount.value),
      min_subtotal: Number(discount.min_subtotal),
      uses: Number(stat?.uses ?? 0),
      amount_given: Number(stat?.amount_given ?? 0),
      revenue: Number(stat?.revenue ?? 0),
    };
  });
};

export const fetchDiscount = async (id: string): Promise<Discount> =>
  unwrap(await db.from("discounts").select("*").eq("id", id).single());

export const saveDiscount = async (id: string | null, values: Omit<Discount, "id" | "created_at">) => {
  if (id) {
    await run(db.from("discounts").update(values).eq("id", id));
    return id;
  }
  const { data, error } = await db.from("discounts").insert(values).select("id").single();
  if (error) {
    throw new Error(error.code === "23505" ? "This code already exists. Choose another code." : error.message);
  }
  return data.id as string;
};

export const deleteDiscount = (id: string) => run(db.from("discounts").delete().eq("id", id));

// --- Checkout ---

export interface CartPreviewLine {
  slug: string;
  name: string;
  quantity: number;
  list_unit_price: number;
  discount: number;
  line_total: number;
  due_now: number;
  preorder: boolean;
}

export interface AppliedDiscount {
  id: string;
  name: string;
  code: string | null;
  type?: DiscountType;
  /** product, order or shipping (see the combinations rules in migration 0018). */
  class?: "product" | "order" | "shipping";
  amount: number;
}

/** What the server worked out for the bag (migration 0017). */
export interface CartPreview {
  lines: CartPreviewLine[];
  subtotal: number;
  discount_total: number;
  applied: AppliedDiscount[];
  free_shipping: AppliedDiscount | null;
  shipping_cost_original: number;
  shipping_cost: number;
  items_total: number;
  items_due_now: number;
  total: number;
  amount_charged: number;
  balance_due: number;
  code_status: string | null;
  code_min: number | null;
}

export const previewCart = async (
  items: CartItem[],
  code: string,
  email: string,
  shippingCost: number,
): Promise<CartPreview> =>
  unwrap(
    await db.rpc("preview_cart_discounts", {
      p_items: items.map((item) => ({ slug: item.id, quantity: item.quantity })),
      p_code: code,
      p_email: email,
      p_shipping_cost: shippingCost,
    }),
  );

// --- Share links: /discount/CODE remembers the code until checkout ---

const STORAGE_KEY = "spavioai-discount";

export const getStoredCode = (): string => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

export const storeCode = (code: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Private mode: the customer can still type the code.
  }
};

export const clearStoredCode = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
};
