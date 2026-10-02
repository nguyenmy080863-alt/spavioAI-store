import { db, run } from "@/lib/orders";

export type DraftLanguage = "de" | "en" | "vi";

export interface DraftAddress {
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
}

export interface DraftItem {
  id: string;
  draft_id: string;
  product_id: string;
  quantity: number;
  list_price: number;
  on_sale: boolean;
  custom_price: number | null;
  custom_price_reason: string;
  unit_price: number;
  products: { name: string; sku: string; stock: number } | null;
}

export interface Draft {
  id: string;
  draft_number: string;
  status: "open" | "completed";
  customer_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: DraftAddress;
  language: DraftLanguage;
  shipping_label: string;
  shipping_cost: number;
  discount_code: string;
  custom_discount_type: "percent" | "fixed" | null;
  custom_discount_value: number;
  custom_discount_reason: string;
  tags: string[];
  notes: string;
  payment_link_token: string | null;
  payment_link_created_at: string | null;
  payment_link_expires_at: string | null;
  sales_order_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  draft_order_items: DraftItem[];
}

export type DraftState = "open" | "link_active" | "link_expired" | "awaiting_payment" | "completed";

export const DRAFT_STATE_LABEL: Record<DraftState, string> = {
  open: "Draft",
  link_active: "Payment link sent",
  link_expired: "Link expired",
  awaiting_payment: "Customer started payment",
  completed: "Order created",
};

export const draftState = (draft: Draft, now = Date.now()): DraftState => {
  if (draft.status === "completed") return "completed";
  if (draft.sales_order_id) return "awaiting_payment";
  if (draft.payment_link_token && draft.payment_link_expires_at) {
    return new Date(draft.payment_link_expires_at).getTime() > now ? "link_active" : "link_expired";
  }
  return "open";
};

/** Pricing the server works out for a draft (same engine as checkout, see migration 0021). */
export interface DraftPricing {
  lines: { slug: string; name: string; quantity: number; list_unit_price: number; discount: number; line_total: number }[];
  subtotal: number;
  discount_total: number;
  applied: { id: string; name: string; code: string | null; class?: string; amount: number }[];
  free_shipping: { name: string } | null;
  shipping_cost_original: number;
  shipping_cost: number;
  items_total: number;
  total: number;
  amount_charged: number;
  code_status: string | null;
  code_min: number | null;
  list_total: number;
  custom_discount_amount: number;
  short_stock: { name: string; requested: number; available: number }[];
}

export const CODE_STATUS_MESSAGE: Record<string, string> = {
  invalid: "This code does not exist.",
  inactive: "This code is switched off.",
  expired: "This code has expired.",
  not_started: "This code is not active yet.",
  usage_limit: "This code has been used up.",
  already_used: "This customer already used this code.",
  new_customers_only: "This code is for new customers only.",
  not_eligible: "This customer does not qualify for this code.",
  wrong_customer: "This code was issued for another customer.",
  no_eligible_items: "This code does not apply to the items in the draft.",
  min_subtotal: "The draft is below the minimum spend for this code.",
  min_quantity: "The draft has too few items for this code.",
  bxgy_not_met: "The draft does not have the items this offer needs.",
  not_combinable: "This code cannot be combined with the discount already applied.",
  not_applicable: "This code cannot be used on this draft.",
};

export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "card_terminal", label: "Card terminal" },
  { value: "paypal_manual", label: "PayPal (outside the store)" },
  { value: "other", label: "Other" },
];

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

const DRAFT_SELECT = "*, draft_order_items(*, products(name, sku, stock))";

export const fetchDrafts = async (): Promise<Draft[]> =>
  unwrap(await db.from("draft_orders").select(DRAFT_SELECT).order("created_at", { ascending: false }));

export const fetchDraft = async (id: string): Promise<Draft> =>
  unwrap(await db.from("draft_orders").select(DRAFT_SELECT).eq("id", id).single());

export const createDraft = async (init: Partial<Draft> = {}): Promise<string> => {
  const { data, error } = await db.from("draft_orders").insert(init).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
};

export const updateDraft = (id: string, patch: Partial<Omit<Draft, "id" | "draft_order_items">>) =>
  run(db.from("draft_orders").update(patch).eq("id", id));

export const deleteDraft = (id: string) => run(db.from("draft_orders").delete().eq("id", id));

export const addDraftItem = (draftId: string, productId: string, quantity = 1) =>
  run(db.from("draft_order_items").insert({ draft_id: draftId, product_id: productId, quantity }));

export const updateDraftItem = (
  id: string,
  patch: { quantity?: number; custom_price?: number | null; custom_price_reason?: string },
) => run(db.from("draft_order_items").update(patch).eq("id", id));

export const removeDraftItem = (id: string) => run(db.from("draft_order_items").delete().eq("id", id));

export const refreshDraftPrices = (id: string) => run(db.rpc("refresh_draft_prices", { p_draft_id: id }));

export const fetchDraftPricing = async (id: string): Promise<DraftPricing> =>
  unwrap(await db.rpc("draft_pricing", { p_draft_id: id }));

export const createOrderFromDraft = async (
  id: string,
  markPaid: boolean,
  paymentMethod: string,
  paymentReference: string,
) =>
  unwrap<{ order_id: string; order_number: string; paid: boolean }>(
    await db.rpc("create_order_from_draft", {
      p_draft_id: id,
      p_mark_paid: markPaid,
      p_payment_method: paymentMethod,
      p_payment_reference: paymentReference,
    }),
  );

export const createPaymentLink = async (id: string, hours: number) =>
  unwrap<{ token: string; expires_at: string }>(await db.rpc("create_draft_payment_link", { p_draft_id: id, p_hours: hours }));

/** Customer-facing URL of a payment link (German has no language prefix). */
export const paymentLinkUrl = (token: string, language: DraftLanguage) =>
  `${window.location.origin}${language === "de" ? "" : `/${language}`}/pay/${token}`;

/** Items value before discounts, for the list. */
export const draftItemsValue = (draft: Draft) =>
  draft.draft_order_items.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);

// --- Customer payment page (anonymous, guarded by the secret link) ---

export interface PublicDraft {
  status: "open" | "paid" | "expired" | "cancelled" | "awaiting_payment";
  draft_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: DraftAddress;
  expires_at: string | null;
  order_number: string | null;
  amount_due: number | null;
  pricing: DraftPricing | null;
}

export const fetchDraftByToken = async (token: string): Promise<PublicDraft | null> =>
  unwrap(await db.rpc("get_draft_by_token", { p_token: token }));

export const placeOrderFromDraft = async (
  token: string,
  phone: string,
  address: { address: string; city: string; postal_code: string; country: string },
  marketingConsent: boolean,
) =>
  unwrap<{ order_number: string; customer_email: string; amount_charged: number; total: number }>(
    await db.rpc("place_order_from_draft", {
      p_token: token,
      p_phone: phone,
      p_address: address,
      p_marketing_consent: marketingConsent,
    }),
  );
