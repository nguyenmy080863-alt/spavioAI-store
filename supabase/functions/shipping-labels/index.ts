// Buys, lists and cancels carrier shipping labels with Sendcloud (see migration 0022).
//
// Status: written but NOT deployed or connected. Without the Sendcloud secrets every action answers
// "sendcloud_not_connected" and the admin keeps creating deliveries and typing tracking by hand.
// Setup steps are in docs/admin/19-shipping-labels.md.
//
// One function, three actions (POST { action, ... }), staff only (super_admin, order_processor):
//   methods  { country, weight_grams }                 shipping methods and prices for a destination
//   buy      { delivery_id, method_id, weight_grams, recipient }   buy the label, save PDFs + tracking
//   cancel   { delivery_id }                            cancel a label that was not collected yet
//
// EU destinations only for now (no customs forms). Secrets: SENDCLOUD_PUBLIC_KEY,
// SENDCLOUD_SECRET_KEY; optional SHIP_FROM_COUNTRY (default DE), SENDCLOUD_SENDER_ADDRESS_ID.

import { json, preflight, requireRole, serviceClient } from "../_shared/http.ts";

const PUBLIC_KEY = Deno.env.get("SENDCLOUD_PUBLIC_KEY");
const SECRET_KEY = Deno.env.get("SENDCLOUD_SECRET_KEY");
const FROM_COUNTRY = (Deno.env.get("SHIP_FROM_COUNTRY") ?? "DE").toUpperCase();
const SENDER_ADDRESS_ID = Deno.env.get("SENDCLOUD_SENDER_ADDRESS_ID");
const API = "https://panel.sendcloud.sc/api/v2";

const EU = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

interface SendcloudMethod {
  id: number;
  name: string;
  carrier: string;
  price: number;
  min_weight: string;
  max_weight: string;
  countries?: { iso_2: string; price: number }[];
}

interface Recipient {
  name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  phone?: string;
  email?: string;
}

const authHeader = () => `Basic ${btoa(`${PUBLIC_KEY}:${SECRET_KEY}`)}`;

/** Shipping methods that can carry this weight to this country. */
const loadMethods = async (country: string, weightGrams: number) => {
  const response = await fetch(`${API}/shipping_methods?to_country=${country}&from_country=${FROM_COUNTRY}`, {
    headers: { Authorization: authHeader() },
  });
  if (!response.ok) throw new Error(`Sendcloud shipping methods failed (${response.status})`);
  const kg = weightGrams / 1000;
  const methods: SendcloudMethod[] = (await response.json()).shipping_methods ?? [];
  return methods
    .filter((m) => kg >= Number(m.min_weight) && kg <= Number(m.max_weight))
    .map((m) => ({
      id: m.id,
      name: m.name,
      carrier: m.carrier,
      price: Math.round(Number(m.countries?.find((c) => c.iso_2 === country)?.price ?? m.price ?? 0) * 100) / 100,
      min_weight_grams: Math.round(Number(m.min_weight) * 1000),
      max_weight_grams: Math.round(Number(m.max_weight) * 1000),
    }));
};

const store = async (supabase: ReturnType<typeof serviceClient>, path: string, url: string | undefined) => {
  if (!url) return "";
  const pdf = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!pdf.ok) throw new Error(`Could not download the label (${pdf.status})`);
  const { error } = await supabase.storage
    .from("shipping-labels")
    .upload(path, new Uint8Array(await pdf.arrayBuffer()), { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Could not store the label: ${error.message}`);
  return path;
};

Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;

  const auth = await requireRole(request, ["super_admin", "order_processor"]);
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  if (!PUBLIC_KEY || !SECRET_KEY) {
    return json({ error: "sendcloud_not_connected", message: "Sendcloud is not connected yet." }, 503);
  }

  try {
    if (action === "methods") {
      const country = String(body.country ?? "").toUpperCase();
      const weight = Number(body.weight_grams);
      if (!EU.has(country)) return json({ error: "Labels are only available for EU destinations for now." }, 422);
      if (!(weight >= 10 && weight <= 30000)) return json({ error: "Enter a weight between 10 and 30000 grams." }, 422);
      return json({ methods: await loadMethods(country, weight) });
    }

    const supabase = serviceClient();

    if (action === "buy") {
      const recipient = (body.recipient ?? {}) as Recipient;
      const country = String(recipient.country ?? "").toUpperCase();
      const weight = Number(body.weight_grams);
      const missing = ["name", "street", "postal_code", "city"].filter((k) => !String((recipient as never)[k] ?? "").trim());
      if (missing.length > 0) return json({ error: `Missing address fields: ${missing.join(", ")}` }, 422);
      if (!EU.has(country)) return json({ error: "Labels are only available for EU destinations for now." }, 422);
      if (!(weight >= 10 && weight <= 30000)) return json({ error: "Enter a weight between 10 and 30000 grams." }, 422);

      const { data: delivery, error } = await supabase
        .from("delivery_orders")
        .select("id, delivery_number, status, label_created_at, label_cancelled_at, sales_orders(order_number)")
        .eq("id", body.delivery_id)
        .single();
      if (error || !delivery) return json({ error: "Delivery not found" }, 404);
      if (delivery.status !== "preparing") return json({ error: "Labels can only be bought for a delivery that is still being prepared" }, 409);
      if (delivery.label_created_at && !delivery.label_cancelled_at) return json({ error: "This delivery already has a label. Cancel it first to buy another." }, 409);

      const method = (await loadMethods(country, weight)).find((m) => m.id === Number(body.method_id));
      if (!method) return json({ error: "That shipping method cannot carry this weight to this country. Choose another." }, 422);

      const parcelResponse = await fetch(`${API}/parcels`, {
        method: "POST",
        headers: { Authorization: authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          parcel: {
            name: recipient.name,
            address: recipient.street,
            house_number: recipient.house_number || undefined,
            city: recipient.city,
            postal_code: recipient.postal_code,
            country,
            telephone: recipient.phone || undefined,
            email: recipient.email || undefined,
            weight: (weight / 1000).toFixed(3),
            request_label: true,
            shipment: { id: method.id },
            order_number: (delivery.sales_orders as { order_number?: string } | null)?.order_number ?? delivery.delivery_number,
            external_reference: delivery.delivery_number,
            ...(SENDER_ADDRESS_ID ? { sender_address: Number(SENDER_ADDRESS_ID) } : {}),
          },
        }),
      });
      const parcelBody = await parcelResponse.json().catch(() => ({}));
      if (!parcelResponse.ok) {
        const detail = parcelBody?.error?.message ?? JSON.stringify(parcelBody?.error ?? {}).slice(0, 300);
        return json({ error: `Sendcloud refused the label: ${detail || parcelResponse.status}` }, 502);
      }
      const parcel = parcelBody.parcel;
      if (!parcel?.id) return json({ error: "Sendcloud did not return a parcel" }, 502);

      const a6 = await store(supabase, `${delivery.id}-a6.pdf`, parcel.label?.label_printer);
      const a4 = await store(supabase, `${delivery.id}-a4.pdf`, parcel.label?.normal_printer?.[0]);

      const { error: updateError } = await supabase
        .from("delivery_orders")
        .update({
          carrier: String(parcel.carrier?.code ?? method.carrier ?? ""),
          tracking_number: String(parcel.tracking_number ?? ""),
          label_parcel_id: String(parcel.id),
          label_service: method.name,
          label_tracking_url: String(parcel.tracking_url ?? ""),
          label_cost: method.price,
          label_weight_grams: weight,
          label_a6_path: a6,
          label_a4_path: a4,
          label_created_at: new Date().toISOString(),
          label_cancelled_at: null,
        })
        .eq("id", delivery.id);
      if (updateError) return json({ error: `The label was bought but saving failed: ${updateError.message}. Parcel ${parcel.id} in Sendcloud.` }, 500);

      return json({ ok: true, tracking_number: parcel.tracking_number ?? null, label_cost: method.price, service: method.name });
    }

    if (action === "cancel") {
      const { data: delivery, error } = await supabase
        .from("delivery_orders")
        .select("id, status, label_parcel_id, label_created_at, label_cancelled_at")
        .eq("id", body.delivery_id)
        .single();
      if (error || !delivery) return json({ error: "Delivery not found" }, 404);
      if (!delivery.label_created_at || delivery.label_cancelled_at) return json({ error: "There is no active label to cancel" }, 409);
      if (delivery.status !== "preparing") return json({ error: "The parcel was already handed to the carrier. Contact the carrier instead." }, 409);

      const response = await fetch(`${API}/parcels/${delivery.label_parcel_id}/cancel`, {
        method: "POST",
        headers: { Authorization: authHeader() },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return json({ error: `Sendcloud could not cancel it: ${result?.message ?? result?.error?.message ?? response.status}` }, 502);
      }

      const { error: updateError } = await supabase
        .from("delivery_orders")
        .update({ label_cancelled_at: new Date().toISOString(), tracking_number: null, carrier: null })
        .eq("id", delivery.id);
      if (updateError) return json({ error: updateError.message }, 500);
      return json({ ok: true, sendcloud: result?.status ?? "cancelled" });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
