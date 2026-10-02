import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * The order and inventory tables (migration 0011) are not in the generated Supabase types yet,
 * so they are queried through an untyped client. Regenerate types.ts to drop this.
 */
export const db = supabase as unknown as SupabaseClient;

export interface ProductRef {
  name: string;
  sku: string;
}

export interface InventoryRow {
  product_id: string;
  on_hand: number;
  in_transit: number;
  committed: number;
}

export interface PurchaseOrderItem {
  id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  products: ProductRef | null;
}

export type PurchaseOrderStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
  status: PurchaseOrderStatus;
  expected_date: string | null;
  notes: string;
  ordered_at: string | null;
  received_at: string | null;
  created_at: string;
  purchase_order_items: PurchaseOrderItem[];
}

export interface SalesOrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products: ProductRef | null;
}

export interface DeliveryOrderItem {
  id: string;
  sales_order_item_id: string;
  quantity: number;
}

export type DeliveryStatus = "preparing" | "on_delivery" | "delivered" | "cancelled";

export interface DeliveryOrder {
  id: string;
  delivery_number: string;
  status: DeliveryStatus;
  carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  delivery_order_items: DeliveryOrderItem[];
}

export type SalesOrderStatus = "open" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "paid" | "refunded";

export interface SalesOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  status: SalesOrderStatus;
  payment_status: PaymentStatus;
  total: number;
  paid_at: string | null;
  created_at: string;
  sales_order_items: SalesOrderItem[];
  delivery_orders: DeliveryOrder[];
}

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const fetchInventory = async (): Promise<InventoryRow[]> =>
  unwrap(await db.from("inventory").select("product_id, on_hand, in_transit, committed"));

export const fetchPurchaseOrders = async (): Promise<PurchaseOrder[]> =>
  unwrap(
    await db
      .from("purchase_orders")
      .select("*, purchase_order_items(*, products(name, sku))")
      .order("created_at", { ascending: false }),
  );

export const fetchPurchaseOrder = async (id: string): Promise<PurchaseOrder> =>
  unwrap(
    await db.from("purchase_orders").select("*, purchase_order_items(*, products(name, sku))").eq("id", id).single(),
  );

const SALES_SELECT = "*, sales_order_items(*, products(name, sku)), delivery_orders(*, delivery_order_items(*))";

export const fetchSalesOrders = async (): Promise<SalesOrder[]> =>
  unwrap(await db.from("sales_orders").select(SALES_SELECT).order("created_at", { ascending: false }));

export const fetchSalesOrder = async (id: string): Promise<SalesOrder> =>
  unwrap(await db.from("sales_orders").select(SALES_SELECT).eq("id", id).single());

/** Run a write and throw on a Supabase error so react-query mutations report it. */
export const run = async (request: PromiseLike<{ error: { message: string } | null }>) => {
  const { error } = await request;
  if (error) throw new Error(error.message);
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
  open: "Open",
  completed: "Completed",
  unpaid: "Unpaid",
  paid: "Paid",
  refunded: "Refunded",
  preparing: "Preparing",
  on_delivery: "On delivery",
  delivered: "Delivered",
  in_review: "In review",
  awaiting_customer: "Awaiting customer",
  visit_scheduled: "Visit scheduled",
  resolved: "Resolved",
  closed: "Closed",
};

export const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : "—");
