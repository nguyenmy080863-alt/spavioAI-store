import { db, run } from "@/lib/orders";

/** Highest value of one card. Keep in step with gift_card_max_amount() in migration 0024. */
export const MAX_GIFT_CARD = 200;

export interface GiftCard {
  id: string;
  code: string;
  initial_amount: number;
  balance: number;
  recipient_email: string;
  recipient_name: string;
  note: string;
  status: "active" | "disabled";
  expires_at: string | null;
  created_at: string;
}

export interface GiftCardTransaction {
  id: string;
  gift_card_id: string;
  type: "issued" | "redeemed" | "restored" | "refunded_to_card" | "adjusted";
  amount: number;
  balance_after: number;
  note: string;
  created_at: string;
  sales_orders: { order_number: string } | null;
  return_requests: { return_number: string } | null;
}

export const TRANSACTION_LABEL: Record<GiftCardTransaction["type"], string> = {
  issued: "Issued",
  redeemed: "Used on an order",
  restored: "Given back (order cancelled)",
  refunded_to_card: "Refund credited to the card",
  adjusted: "Correction",
};

export type GiftCardState = "active" | "used_up" | "expired" | "disabled";

export const GIFT_CARD_STATE_LABEL: Record<GiftCardState, string> = {
  active: "Active",
  used_up: "Used up",
  expired: "Expired",
  disabled: "Switched off",
};

export const giftCardState = (card: GiftCard, now = Date.now()): GiftCardState => {
  if (card.status === "disabled") return "disabled";
  if (card.expires_at && new Date(card.expires_at).getTime() < now) return "expired";
  if (Number(card.balance) <= 0) return "used_up";
  return "active";
};

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

// --- Staff ---

export const fetchGiftCards = async (): Promise<GiftCard[]> =>
  (unwrap<GiftCard[]>(await db.from("gift_cards").select("*").order("created_at", { ascending: false })) ?? []).map((card) => ({
    ...card,
    initial_amount: Number(card.initial_amount),
    balance: Number(card.balance),
  }));

export const fetchGiftCardTransactions = async (cardId: string): Promise<GiftCardTransaction[]> =>
  unwrap(
    await db
      .from("gift_card_transactions")
      .select("*, sales_orders(order_number), return_requests(return_number)")
      .eq("gift_card_id", cardId)
      .order("created_at", { ascending: false }),
  );

export const createGiftCard = async (input: {
  amount: number;
  email: string;
  name: string;
  note: string;
  expiresAt: string | null;
}) =>
  unwrap<{ id: string; code: string }>(
    await db.rpc("create_gift_card", {
      p_amount: input.amount,
      p_recipient_email: input.email,
      p_recipient_name: input.name,
      p_note: input.note,
      p_expires_at: input.expiresAt,
    }),
  );

export const setGiftCardStatus = (id: string, active: boolean) =>
  run(db.rpc("set_gift_card_status", { p_id: id, p_active: active }));

export const adjustGiftCard = (id: string, amount: number, note: string) =>
  run(db.rpc("adjust_gift_card", { p_id: id, p_amount: amount, p_note: note }));

export const creditGiftCardForReturn = (returnId: string, amount: number) =>
  run(db.rpc("credit_gift_card_for_return", { p_return_id: returnId, p_amount: amount }));

export interface GiftCardSummary {
  issued: number;
  redeemed: number;
  returned_to_cards: number;
  adjusted: number;
  outstanding_balance: number;
  cards_with_balance: number;
}

export const fetchGiftCardSummary = async (from: Date, to: Date): Promise<GiftCardSummary> =>
  unwrap(await db.rpc("gift_card_summary", { p_from: from.toISOString(), p_to: to.toISOString() }));

export interface GiftCardLedgerRow {
  date: string;
  type: GiftCardTransaction["type"];
  amount: number;
  card: string;
  order: string | null;
  return: string | null;
}

export const fetchGiftCardLedger = async (from: Date, to: Date): Promise<GiftCardLedgerRow[]> =>
  unwrap(await db.rpc("gift_card_ledger", { p_from: from.toISOString(), p_to: to.toISOString() }));

// --- Customers (anonymous, with the secret code) ---

export type GiftCardCheck = { status: "ok"; balance: number } | { status: "invalid" | "disabled" | "expired" | "empty" };

export const checkGiftCard = async (code: string): Promise<GiftCardCheck> =>
  unwrap(await db.rpc("check_gift_card", { p_code: code }));

export const applyGiftCardToOrder = async (orderNumber: string, email: string, code: string) =>
  unwrap<{ applied: number; amount_due: number; paid: boolean; remaining_balance: number }>(
    await db.rpc("apply_gift_card_to_order", { p_order_number: orderNumber, p_email: email, p_code: code }),
  );

/** A ready-to-send message with the code, for staff who send it by hand (emails are not connected yet). */
export const giftCardMessage = (card: Pick<GiftCard, "code" | "initial_amount" | "recipient_name" | "expires_at">, lang: "de" | "en" | "vi") => {
  const amount = `€${Number(card.initial_amount).toFixed(2).replace(/\.00$/, "")}`;
  const date = card.expires_at ? new Date(card.expires_at).toLocaleDateString(lang === "de" ? "de-DE" : lang === "vi" ? "vi-VN" : "en-GB") : "";
  const hello = card.recipient_name ? card.recipient_name : "";
  if (lang === "de") {
    return `Hallo${hello ? ` ${hello}` : ""},\n\nhier ist dein Spavio AI Store Geschenkgutschein über ${amount}.\n\nCode: ${card.code}\n\nGib den Code im Warenkorb unter "Geschenkgutschein" ein. Der Wert wird bei der Bestellung verrechnet; ein Restbetrag bleibt auf dem Gutschein.${date ? `\nGültig bis ${date}.` : ""}\n\nViel Freude!\nSpavio AI Store`;
  }
  if (lang === "vi") {
    return `Xin chào${hello ? ` ${hello}` : ""},\n\nĐây là thẻ quà tặng Spavio AI Store trị giá ${amount} dành cho bạn.\n\nMã: ${card.code}\n\nNhập mã vào ô "Thẻ quà tặng" khi thanh toán. Giá trị sẽ được trừ vào đơn hàng; số dư còn lại vẫn được giữ trên thẻ.${date ? `\nCó hiệu lực đến ${date}.` : ""}\n\nChúc bạn vui!\nSpavio AI Store`;
  }
  return `Hello${hello ? ` ${hello}` : ""},\n\nhere is your Spavio AI Store gift card worth ${amount}.\n\nCode: ${card.code}\n\nEnter the code at checkout under "Gift card". Its value is used for your order, and any rest stays on the card.${date ? `\nValid until ${date}.` : ""}\n\nEnjoy!\nSpavio AI Store`;
};
