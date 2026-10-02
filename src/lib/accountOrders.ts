import { db } from "@/lib/orders";

export interface CustomerOrderItem {
  name: string;
  slug: string;
  quantity: number;
  unit_price: number;
}

export interface CustomerOrderDelivery {
  delivery_number: string;
  status: "preparing" | "on_delivery" | "delivered" | "cancelled";
  carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
}

/** An order as a customer may see it (migration 0014). */
export interface CustomerOrder {
  order_number: string;
  status: "open" | "completed" | "cancelled";
  payment_status: "unpaid" | "paid" | "refunded";
  payment_reported: boolean;
  total: number;
  shipping_cost: number;
  amount_charged: number;
  balance_due: number;
  discount_code: string;
  discount_amount: number;
  shipping_discount: number;
  shipping_address: { address?: string; city?: string; postal_code?: string; country?: string };
  created_at: string;
  paid_at: string | null;
  items: CustomerOrderItem[];
  deliveries: CustomerOrderDelivery[];
  warranty_expires_at: string | null;
  /** True while at least one delivered item can still be returned within the trial window. */
  can_return: boolean;
  return_window_ends_at: string | null;
  returns: { return_number: string; status: string; refund_amount: number; created_at: string }[];
}

export type OrderStage =
  | "cancelled"
  | "refunded"
  | "awaiting_payment"
  | "payment_review"
  | "preparing"
  | "shipped"
  | "delivered";

/** One customer-friendly status for an order, derived from payment and delivery state. */
export const orderStage = (order: CustomerOrder): OrderStage => {
  if (order.payment_status === "refunded") return "refunded";
  if (order.status === "cancelled") return "cancelled";
  const active = order.deliveries.filter((d) => d.status !== "cancelled");
  if (active.length > 0 && active.every((d) => d.status === "delivered")) return "delivered";
  if (active.some((d) => d.status === "on_delivery" || d.status === "delivered")) return "shipped";
  if (order.payment_status === "paid") return "preparing";
  return order.payment_reported ? "payment_review" : "awaiting_payment";
};

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const fetchMyOrders = async (): Promise<CustomerOrder[]> => unwrap(await db.rpc("list_my_orders"));

/** Guest lookup by order number + email; signed-in owners may omit the email. */
export const fetchOrderByNumber = async (orderNumber: string, email: string): Promise<CustomerOrder | null> =>
  unwrap(await db.rpc("get_customer_order", { p_order_number: orderNumber, p_email: email || null }));
