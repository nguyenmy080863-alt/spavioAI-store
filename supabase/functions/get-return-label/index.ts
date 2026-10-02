// Lets a customer (guest or signed in) download the prepaid return label PDF (see migration 0016).
//
// Status: written but NOT deployed. Deploy with JWT verification off (guests have no account);
// access is protected by return number + email instead:
//   supabase functions deploy get-return-label --no-verify-jwt
//
// Request: POST { "return_number": "RT-00001", "email": "..." }. A signed-in owner may omit the
// email and send their access token instead.

import { corsHeaders, json, preflight, serviceClient } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;

  const { return_number, email } = await request.json().catch(() => ({}));
  if (!return_number) return json({ error: "return_number is required" }, 400);

  const supabase = serviceClient();
  const { data: ret } = await supabase
    .from("return_requests")
    .select("id, customer_id, customer_email, status, label_created_at")
    .eq("return_number", String(return_number).trim().toUpperCase())
    .maybeSingle();

  // Same answer for "no such return" and "wrong email", so numbers cannot be probed.
  let allowed = !!ret && String(ret.customer_email).toLowerCase() === String(email ?? "").trim().toLowerCase();
  if (ret && !allowed) {
    const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      allowed = !!data.user && data.user.id === ret.customer_id;
    }
  }
  if (!ret || !allowed) return json({ error: "Return not found" }, 404);
  if (!ret.label_created_at || ["cancelled", "rejected"].includes(ret.status)) {
    return json({ error: "There is no label for this return" }, 404);
  }

  const { data: file, error } = await supabase.storage.from("return-labels").download(`${ret.id}.pdf`);
  if (error || !file) return json({ error: "The label is not available" }, 404);

  return new Response(file, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="return-label-${String(return_number).toUpperCase()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});
