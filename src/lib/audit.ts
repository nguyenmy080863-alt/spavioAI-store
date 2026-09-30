import { supabase } from "@/integrations/supabase/client";

type Details = Record<string, unknown>;

/** Best-effort admin action log. Never blocks the calling mutation. */
export const logAudit = async (
  action: string,
  entity: string,
  entityId: string | null,
  details: Details = {},
) => {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      action,
      entity,
      entity_id: entityId,
      details: details as never,
      actor_id: data.user?.id ?? null,
      actor_email: data.user?.email ?? null,
    });
  } catch {
    // Logging must never break an admin operation.
  }
};
