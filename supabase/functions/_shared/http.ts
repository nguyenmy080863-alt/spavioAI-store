// Small helpers shared by the return Edge Functions (CORS, JSON answers, staff check).
import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export const preflight = (request: Request) =>
  request.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;

export const serviceClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/**
 * Checks that the caller is a signed-in team member with one of the given roles.
 * Returns the user id, or a ready-made error Response.
 */
export const requireRole = async (request: Request, roles: string[]): Promise<{ userId: string } | Response> => {
  const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return json({ error: "Not signed in" }, 401);

  const supabase = serviceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return json({ error: "Not signed in" }, 401);

  const { data: rows } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
  if (!(rows ?? []).some((row: { role: string }) => roles.includes(row.role))) {
    return json({ error: "You do not have permission to do this" }, 403);
  }
  return { userId: data.user.id };
};
