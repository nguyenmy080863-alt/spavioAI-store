// Sends the order emails queued in public.email_outbox (see migration 0014).
//
// Status: written but NOT deployed or connected. Until it is, queued rows stay "pending".
// Setup steps are in docs/admin/13-order-emails.md.
//
// Each call sends up to 20 pending emails, so it can be triggered by a database webhook on
// email_outbox INSERT, by a schedule, or by hand.

import { createClient } from "npm:@supabase/supabase-js@2";
import { normaliseLang, renderEmail, type EmailKind } from "./templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM"); // e.g. "Spavio AI Store <orders@spavioai.store>"
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://spavioai.store";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const MAX_ATTEMPTS = 5;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  // The function is deployed with --no-verify-jwt, so protect it with a shared secret.
  if (!WEBHOOK_SECRET || request.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    return json({ error: "RESEND_API_KEY and EMAIL_FROM are not configured" }, 503);
  }

  const { data: rows, error } = await supabase
    .from("email_outbox")
    .select("*")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    try {
      const { data: order, error: orderError } = await supabase
        .from("sales_orders")
        .select("*, sales_order_items(quantity, unit_price, products(name))")
        .eq("id", row.sales_order_id)
        .single();
      if (orderError || !order) throw new Error(orderError?.message ?? "Order not found");

      let delivery = null;
      if (row.delivery_order_id) {
        const { data } = await supabase
          .from("delivery_orders")
          .select("carrier, tracking_number")
          .eq("id", row.delivery_order_id)
          .single();
        delivery = data;
      }

      const lang = normaliseLang(row.language);
      const email = renderEmail({
        kind: row.kind as EmailKind,
        lang,
        siteUrl: SITE_URL,
        to: row.to_email,
        delivery,
        order: {
          ...order,
          items: order.sales_order_items.map(
            (i: { quantity: number; unit_price: number; products: { name: string } | null }) => ({
              name: i.products?.name ?? "",
              quantity: i.quantity,
              unit_price: i.unit_price,
            }),
          ),
        },
      });

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
          // A retry after a timeout must not send the email twice.
          "Idempotency-Key": row.id,
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [row.to_email],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });
      if (!response.ok) throw new Error(`Provider answered ${response.status}: ${(await response.text()).slice(0, 300)}`);

      await supabase
        .from("email_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: "" })
        .eq("id", row.id);
      sent += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      await supabase
        .from("email_outbox")
        .update({
          attempts,
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          last_error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
        })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return json({ sent, failed });
});
