// Refunds a return through PayPal and records it on the return (see migration 0016).
//
// Status: written but NOT deployed or connected. Until PayPal API credentials are set as secrets the
// function answers "paypal_not_connected" and the admin refunds by hand in PayPal instead.
// Setup steps are in docs/admin/14-returns.md.
//
// Called from the admin panel with the signed-in user's token (JWT verification stays on).
// Allowed roles: super_admin, order_processor.
//
// Amount refunded:
//   refund return   items value - deduction (the prepaid label cost, if we deduct it)
//   exchange        the difference owed to the customer (-settlement_amount), if negative
// minus the part credited back to a gift card (return_requests.gift_card_refund).
// PayPal is called with PayPal-Request-Id = the return id, so pressing the button twice, or a retry
// after a timeout, can never refund the customer twice.

import { corsHeaders, json, preflight, requireRole, serviceClient } from "../_shared/http.ts";

const CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET");
const BASE = Deno.env.get("PAYPAL_ENV") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

const accessToken = async (): Promise<string> => {
  const response = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`PayPal sign-in failed (${response.status})`);
  return (await response.json()).access_token;
};

Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;

  const auth = await requireRole(request, ["super_admin", "order_processor"]);
  if (auth instanceof Response) return auth;

  const { return_id } = await request.json().catch(() => ({}));
  if (!return_id) return json({ error: "return_id is required" }, 400);

  const supabase = serviceClient();
  const { data: ret, error } = await supabase
    .from("return_requests")
    .select("*, sales_orders!return_requests_sales_order_id_fkey(order_number, payment_method, payment_reference, gift_card_amount)")
    .eq("id", return_id)
    .single();
  if (error || !ret) return json({ error: "Return not found" }, 404);

  if (ret.status === "refunded") return json({ ok: true, already: true, refund_reference: ret.refund_reference });
  if (ret.status !== "received") return json({ error: "Mark the parcel as received before refunding" }, 409);

  // How much goes back to the customer.
  let amount: number;
  if (ret.resolution === "exchange") {
    if (!ret.replacement_order_id) return json({ error: "Create the replacement order first" }, 409);
    amount = Math.round(-Number(ret.settlement_amount) * 100) / 100;
  } else {
    amount = Math.round((Number(ret.refund_amount) - Number(ret.refund_deduction)) * 100) / 100;
  }

  // A gift card may have paid part of the order. That part goes back to the card (done in the admin
  // first, see credit_gift_card_for_return); PayPal only refunds the rest.
  const giftPaid = Number(ret.sales_orders?.gift_card_amount ?? 0);
  if (giftPaid > 0 && ret.gift_card_refund === null) {
    return json({ error: "This order was partly paid with a gift card. Decide the gift card part of the refund first." }, 409);
  }
  amount = Math.round((amount - Number(ret.gift_card_refund ?? 0)) * 100) / 100;

  // Nothing to pay back (for example the deduction equals the item value): just record it.
  if (!(amount > 0)) {
    const { error: updateError } = await supabase
      .from("return_requests")
      .update({ status: "refunded", refunded_amount: 0, refund_reference: "no refund due" })
      .eq("id", ret.id);
    if (updateError) return json({ error: updateError.message }, 500);
    return json({ ok: true, amount: 0 });
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return json({ error: "paypal_not_connected", message: "PayPal is not connected yet. Refund in PayPal by hand." }, 503);
  }

  const order = ret.sales_orders;
  if (order?.payment_method !== "paypal" || !order?.payment_reference) {
    return json({ error: "This order was not paid with PayPal (or has no PayPal reference). Refund it by hand." }, 422);
  }

  try {
    const token = await accessToken();
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // The stored reference is the PayPal order id; the refund needs the capture id inside it.
    const orderResponse = await fetch(`${BASE}/v2/checkout/orders/${encodeURIComponent(order.payment_reference)}`, { headers });
    if (!orderResponse.ok) throw new Error(`Could not read the PayPal payment (${orderResponse.status})`);
    const captureId = (await orderResponse.json()).purchase_units?.[0]?.payments?.captures?.[0]?.id;
    if (!captureId) throw new Error("The PayPal payment has no captured amount to refund");

    const refundResponse = await fetch(`${BASE}/v2/payments/captures/${captureId}/refund`, {
      method: "POST",
      headers: { ...headers, "PayPal-Request-Id": `return-${ret.id}` },
      body: JSON.stringify({
        amount: { value: amount.toFixed(2), currency_code: "EUR" },
        invoice_id: ret.return_number,
        note_to_payer: `Spavio AI Store refund ${ret.return_number}`,
      }),
    });
    const refund = await refundResponse.json().catch(() => ({}));
    if (!refundResponse.ok) {
      throw new Error(`PayPal refused the refund: ${refund.message ?? refundResponse.status}`);
    }

    const { error: updateError } = await supabase
      .from("return_requests")
      .update({ status: "refunded", refunded_amount: amount, refund_reference: String(refund.id ?? "") })
      .eq("id", ret.id);
    if (updateError) {
      // The money is back with the customer; tell the admin what to record by hand.
      return json({ error: `Refunded in PayPal (refund ${refund.id}) but saving failed: ${updateError.message}` }, 500);
    }
    return json({ ok: true, amount, refund_reference: refund.id, paypal_status: refund.status });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
