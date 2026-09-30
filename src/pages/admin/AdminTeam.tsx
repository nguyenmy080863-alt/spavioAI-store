import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth, ROLE_LABELS, type AppRole } from "@/context/AdminAuthContext";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const ROLES: AppRole[] = ["super_admin", "inventory_manager", "order_processor"];

const AdminTeam = () => {
  const { isSuperAdmin, user } = useAdminAuth();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["admin-team"],
    queryFn: async () => {
      const [{ data: profiles, error: profileError }, { data: roles, error: roleError }] =
        await Promise.all([
          supabase.from("profiles").select("id, email, full_name, created_at"),
          supabase.from("user_roles").select("user_id, role"),
        ]);
      if (profileError) throw profileError;
      if (roleError) throw roleError;
      return (profiles ?? []).map((profile) => ({
        ...profile,
        roles: (roles ?? [])
          .filter((r) => r.user_id === profile.id)
          .map((r) => r.role as AppRole),
      }));
    },
  });

  const toggleRole = async (userId: string, role: AppRole, enabled: boolean) => {
    if (userId === user?.id && role === "super_admin" && !enabled) {
      toast.error("You cannot remove your own Super Admin role.");
      return;
    }
    const { error } = enabled
      ? await supabase.from("user_roles").insert({ user_id: userId, role })
      : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logAudit(enabled ? "grant_role" : "revoke_role", "user_role", userId, { role });
    toast.success(`${ROLE_LABELS[role]} ${enabled ? "granted" : "revoked"}`);
    void queryClient.invalidateQueries({ queryKey: ["admin-team"] });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-light text-foreground">Team & roles</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isSuperAdmin
            ? "Grant or revoke permission levels. Users register at /signup, then you assign a role."
            : "Only a Super Admin can change roles."}
        </p>
      </div>

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3">User</th>
              {ROLES.map((role) => (
                <th key={role} className="p-3">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  Loading team…
                </td>
              </tr>
            )}
            {members.map((member) => (
              <tr key={member.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <p className="text-foreground">{member.email ?? "—"}</p>
                  {member.full_name && (
                    <p className="text-xs text-muted-foreground">{member.full_name}</p>
                  )}
                </td>
                {ROLES.map((role) => (
                  <td key={role} className="p-3">
                    <Checkbox
                      checked={member.roles.includes(role)}
                      disabled={!isSuperAdmin}
                      onCheckedChange={(checked) =>
                        void toggleRole(member.id, role, Boolean(checked))
                      }
                      aria-label={`${ROLE_LABELS[role]} for ${member.email}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => void queryClient.invalidateQueries({ queryKey: ["admin-team"] })}
      >
        Refresh
      </Button>
    </div>
  );
};

export default AdminTeam;
