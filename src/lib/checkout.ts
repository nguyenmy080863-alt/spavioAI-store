import { db, run } from "@/lib/orders";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import type { CartItem } from "@/context/CartContext";

export interface PlacedOrder {
  order_number: string;
  total: number;
  amount_charged: number;
  balance_due: number;
}

export interface PlaceOrderInput {
  name: string;
  email: string;
  phone: string;
  address: { address: string; city: string; postalCode: string; country: string };
  items: CartItem[];
  shippingCost: number;
  paymentMethod: "paypal" | "card" | "klarna";
  marketingConsent: boolean;
  /** Storefront language, used for the order emails. */
  language: string;
}

/** Orders are only stored when a Supabase project is connected; otherwise checkout stays a demo. */
export const canStoreOrders = isSupabaseConfigured;

/**
 * Creates an unpaid order. The server re-prices the bag from the products table, so the amounts it
 * returns are the ones to charge.
 */
export const placeOrder = async (input: PlaceOrderInput): Promise<PlacedOrder> => {
  const { data, error } = await db.rpc("place_order", {
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone,
    p_address: {
      address: input.address.address,
      city: input.address.city,
      postal_code: input.address.postalCode,
      country: input.address.country,
    },
    p_items: input.items.map((item) => ({ slug: item.id, quantity: item.quantity })),
    p_shipping_cost: input.shippingCost,
    p_payment_method: input.paymentMethod,
    p_marketing_consent: input.marketingConsent,
    p_language: ["de", "en", "vi"].includes(input.language) ? input.language : "de",
  });
  if (error) throw new Error(error.message);
  return data as PlacedOrder;
};

/** Stores the payment reference on the order; an admin still has to mark the order as paid. */
export const recordOrderPayment = (orderNumber: string, email: string, reference: string) =>
  run(db.rpc("record_order_payment", { p_order_number: orderNumber, p_email: email, p_reference: reference }));
