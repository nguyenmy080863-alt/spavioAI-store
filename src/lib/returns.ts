import { db, run } from "@/lib/orders";
import { supabase } from "@/integrations/supabase/client";

/** Trial length in days. Keep in step with return_window_days() in migration 0015. */
export const RETURN_WINDOW_DAYS = 30;

export type ReturnStatus = "requested" | "approved" | "received" | "refunded" | "rejected" | "cancelled";
export type ReturnResolution = "refund" | "exchange";
export type ReturnReason = "changed_mind" | "not_suitable" | "defective" | "wrong_item" | "other";

export const RETURN_REASONS: ReturnReason[] = ["changed_mind", "not_suitable", "defective", "wrong_item", "other"];
export const RETURN_STATUSES: ReturnStatus[] = ["requested", "approved", "received", "refunded", "rejected", "cancelled"];

/** Requests that still need work from staff or the customer. */
export const ACTIVE_RETURN_STATUSES: ReturnStatus[] = ["requested", "approved", "received"];

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  received: "Received",
  refunded: "Refunded",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  changed_mind: "Changed my mind (trial)",
  not_suitable: "Not suitable for me",
  defective: "Defective or not working",
  wrong_item: "Wrong item received",
  other: "Other",
};

export interface ReturnableItem {
  sales_order_item_id: string;
  name: string;
  unit_price: number;
  quantity_returnable: number;
  delivered_at: string | null;
  window_ends_at: string | null;
  in_window: boolean;
}

export interface ReturnableOrder {
  order_number: string;
  /** Why the whole order cannot be returned, if so. */
  blocked: "unpaid" | "cancelled" | null;
  window_days: number;
  items: ReturnableItem[];
}

/** A return as the customer sees it. */
export interface PublicReturn {
  return_number: string;
  order_number: string;
  status: ReturnStatus;
  resolution: ReturnResolution;
  reason: ReturnReason;
  customer_note: string;
  refund_amount: number;
  refund_deduction: number;
  refunded_amount: number | null;
  /** Exchange: positive = the customer pays the difference, negative = we refund it. */
  settlement_amount: number;
  replacement_order_number: string | null;
  customer_message: string;
  tracking_number: string;
  has_label: boolean;
  label_carrier: string;
  label_tracking_number: string;
  created_at: string;
  approved_at: string | null;
  received_at: string | null;
  refunded_at: string | null;
  items: {
    name: string;
    quantity: number;
    unit_price: number;
    exchange_name: string | null;
    exchange_unit_price: number | null;
  }[];
}

export interface ReturnPolicy {
  window_days: number;
  /** True when the cost of the prepaid return label is deducted from refunds. */
  deduct_label_cost: boolean;
}

/** Staff view of a return. */
export interface ReturnRequest {
  id: string;
  return_number: string;
  sales_order_id: string;
  status: ReturnStatus;
  resolution: ReturnResolution;
  reason: ReturnReason;
  customer_note: string;
  condition_confirmed: boolean;
  customer_id: string | null;
  customer_name: string;
  customer_email: string;
  refund_amount: number;
  refund_deduction: number;
  refunded_amount: number | null;
  refund_reference: string;
  customer_message: string;
  internal_note: string;
  tracking_number: string;
  label_parcel_id: string;
  label_tracking_number: string;
  label_carrier: string;
  label_cost: number;
  label_created_at: string | null;
  replacement_order_id: string | null;
  settlement_amount: number;
  approved_at: string | null;
  received_at: string | null;
  refunded_at: string | null;
  restocked_at: string | null;
  created_at: string;
  updated_at: string;
  return_items: {
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    exchange_unit_price: number | null;
    products: { name: string } | null;
    exchange: { name: string } | null;
  }[];
  sales_orders: { order_number: string; balance_due: number; payment_method: string; payment_reference: string } | null;
}

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

// --- Customer / guest side (SECURITY DEFINER functions in migration 0015) ---

export const fetchReturnableItems = async (orderNumber: string, email: string): Promise<ReturnableOrder | null> =>
  unwrap(await db.rpc("get_returnable_items", { p_order_number: orderNumber, p_email: email }));

export const createReturn = async (input: {
  orderNumber: string;
  email: string;
  reason: ReturnReason;
  note: string;
  items: { sales_order_item_id: string; quantity: number; exchange_slug?: string }[];
  conditionConfirmed: boolean;
  resolution: ReturnResolution;
}): Promise<{ return_number: string; refund_amount: number }> =>
  unwrap(
    await db.rpc("create_return_request", {
      p_order_number: input.orderNumber,
      p_email: input.email,
      p_reason: input.reason,
      p_note: input.note,
      p_items: input.items,
      p_condition_confirmed: input.conditionConfirmed,
      p_resolution: input.resolution,
    }),
  );

export const fetchPublicReturn = async (returnNumber: string, email: string): Promise<PublicReturn | null> =>
  unwrap(await db.rpc("get_return_request", { p_return_number: returnNumber, p_email: email || null }));

export const addReturnTracking = (returnNumber: string, email: string, tracking: string) =>
  run(db.rpc("add_return_tracking", { p_return_number: returnNumber, p_email: email || null, p_tracking: tracking }));

export const cancelReturn = (returnNumber: string, email: string) =>
  run(db.rpc("cancel_return_request", { p_return_number: returnNumber, p_email: email || null }));

// --- Staff side ---

const RETURN_SELECT =
  "*, return_items(id, product_id, quantity, unit_price, exchange_unit_price, products!return_items_product_id_fkey(name), exchange:products!return_items_exchange_product_id_fkey(name)), sales_orders!return_requests_sales_order_id_fkey(order_number, balance_due, payment_method, payment_reference)";

export const fetchReturns = async (): Promise<ReturnRequest[]> =>
  unwrap(await db.from("return_requests").select(RETURN_SELECT).order("created_at", { ascending: false }));

export const fetchReturn = async (id: string): Promise<ReturnRequest> =>
  unwrap(await db.from("return_requests").select(RETURN_SELECT).eq("id", id).single());

export const fetchReturnPolicy = async (): Promise<ReturnPolicy> => unwrap(await db.rpc("get_return_policy"));

/** Net amount that goes back to the customer for a plain refund. */
export const refundNet = (ret: { refund_amount: number; refund_deduction: number }) =>
  Math.max(Number(ret.refund_amount) - Number(ret.refund_deduction), 0);

/** Downloads the prepaid label PDF through the get-return-label Edge Function. */
export const downloadReturnLabel = async (returnNumber: string, email: string) => {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-return-label`;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const { data } = await supabase.auth.getSession();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    },
    body: JSON.stringify({ return_number: returnNumber, email }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Download failed (${response.status})`);
  }
  const href = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = `return-label-${returnNumber}.pdf`;
  link.click();
  URL.revokeObjectURL(href);
};

// --- Staff: Edge Functions and exchange completion ---

/** Calls a staff Edge Function and turns its JSON error into a readable Error. */
export const invokeStaffFunction = async <T,>(name: string, body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context ? await context.json().catch(() => null) : null;
    throw new Error(detail?.message ?? detail?.error ?? error.message);
  }
  return data as T;
};

/** Refunds the return through PayPal (needs the PayPal secrets; see docs/admin/14-returns.md). */
export const refundReturnWithPayPal = (returnId: string) =>
  invokeStaffFunction<{ ok: boolean; amount?: number; refund_reference?: string }>("refund-return", { return_id: returnId });

/** Creates the prepaid return label with Sendcloud (needs the Sendcloud secrets). */
export const createReturnLabel = (returnId: string) =>
  invokeStaffFunction<{ ok: boolean; label_cost: number; deducted: boolean }>("create-return-label", { return_id: returnId });

export const completeExchange = async (returnId: string) =>
  unwrap<{ replacement_order_id: string; replacement_order_number: string; settlement_amount: number }>(
    await db.rpc("complete_exchange", { p_return_id: returnId }),
  );
