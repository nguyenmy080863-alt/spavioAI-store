import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchAdminProducts } from "@/lib/catalog";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/data/products";

const AdminDashboard = () => {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: fetchAdminProducts,
  });

  const { data: recentLogs = [] } = useQuery({
    queryKey: ["admin-audit-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity, actor_email, created_at, details")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const live = products.filter((p) => p.status === "published" && !p.archived_at);
  const drafts = products.filter((p) => p.status === "draft" && !p.archived_at);
  const lowStock = products.filter((p) => !p.archived_at && p.stock <= p.low_stock_threshold);
  const inventoryValue = live.reduce((sum, p) => sum + Number(p.price) * p.stock, 0);

  const stats = [
    { label: "Published", value: live.length },
    { label: "Drafts", value: drafts.length },
    { label: "Low stock", value: lowStock.length },
    { label: "Stock value", value: formatPrice(inventoryValue) },
  ];

  return (
    <div className="space-y-12">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-light text-foreground">Live view</h1>
          <p className="text-sm text-muted-foreground mt-1">Catalogue health at a glance.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="border border-border p-5">
            <p className="text-xs font-light text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-light text-foreground mt-2">
              {isLoading ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-sm font-light text-foreground mb-4">Low stock alerts</h2>
        {lowStock.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every product is above its threshold.</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {lowStock.map((product) => (
              <li key={product.id} className="flex items-center justify-between px-4 py-3">
                <Link to={`/admin/products/${product.id}`} className="text-sm text-foreground">
                  {product.name}
                  <span className="text-muted-foreground"> · {product.sku}</span>
                </Link>
                <span className="text-sm text-muted-foreground">
                  {product.stock} left (alert at {product.low_stock_threshold})
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-light text-foreground mb-4">Recent admin activity</h2>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {recentLogs.map((log) => (
              <li key={log.id} className="px-4 py-3 text-sm flex justify-between gap-4">
                <span className="text-foreground">
                  {log.actor_email ?? "system"} · {log.action} {log.entity}
                </span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default AdminDashboard;
