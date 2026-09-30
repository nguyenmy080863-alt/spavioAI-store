import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

const AdminAuditLog = () => {
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity, entity_id, actor_email, details, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const term = search.trim().toLowerCase();
  const filtered = logs.filter(
    (log) =>
      !term ||
      log.action.toLowerCase().includes(term) ||
      log.entity.toLowerCase().includes(term) ||
      (log.actor_email ?? "").toLowerCase().includes(term),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-light text-foreground">Audit log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every product, media and role change with actor and timestamp.
        </p>
      </div>

      <Input
        placeholder="Filter by action, entity or admin"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
        maxLength={100}
      />

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3">When</th>
              <th className="p-3">Admin</th>
              <th className="p-3">Action</th>
              <th className="p-3">Entity</th>
              <th className="p-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  Loading log…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No entries yet.
                </td>
              </tr>
            )}
            {filtered.map((log) => (
              <tr key={log.id} className="border-b border-border last:border-0 align-top">
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="p-3 text-foreground">{log.actor_email ?? "system"}</td>
                <td className="p-3 text-muted-foreground">{log.action}</td>
                <td className="p-3 text-muted-foreground">{log.entity}</td>
                <td className="p-3 text-muted-foreground text-xs break-all max-w-xs">
                  {JSON.stringify(log.details)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminAuditLog;
