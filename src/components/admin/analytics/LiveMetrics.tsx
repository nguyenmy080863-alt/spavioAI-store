import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { changePercent, fetchLiveMetrics } from "@/lib/analytics";
import { formatPrice } from "@/data/products";
import StatusBadge from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/admin/analytics/AnalyticsSections";

const REFRESH_MS = 30_000;

const Attention = ({ label, count, to }: { label: string; count: number; to: string }) => (
  <Link to={to} className={`border p-4 block ${count > 0 ? "border-amber-500/50 bg-amber-500/5" : "border-border"}`}>
    <p className={`text-2xl font-light ${count > 0 ? "text-amber-700" : "text-foreground"}`}>{count}</p>
    <p className="text-xs text-muted-foreground mt-1">{label}</p>
  </Link>
);

/** Live monitor: today so far versus yesterday, orders per hour and what needs attention now. */
const LiveMetrics = () => {
  const [paused, setPaused] = useState(false);

  const { data, error, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ["analytics-live"],
    queryFn: fetchLiveMetrics,
    refetchInterval: paused ? false : REFRESH_MS,
    retry: false,
  });

  if (error) {
    return <p className="text-sm text-destructive">{error.message}. Has migration 0020 been applied in Supabase?</p>;
  }
  if (!data) return <p className="text-sm text-muted-foreground">Loading live numbers…</p>;

  const hour = new Date().getHours();
  const hourly = data.hourly.map((point) => ({ ...point, label: `${String(point.hour).padStart(2, "0")}` }));
  const a = data.attention;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${paused ? "bg-muted-foreground" : "bg-emerald-500 animate-pulse"}`} />
          {paused ? "Paused" : "Live"} · updated {new Date(dataUpdatedAt).toLocaleTimeString()}
          {isFetching && " · refreshing…"}
        </p>
        <Button size="sm" variant="outline" onClick={() => setPaused((value) => !value)}>
          {paused ? "Resume" : "Pause"} updates
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Today so far</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card
            label="Revenue today"
            value={formatPrice(data.today.revenue)}
            change={changePercent(data.today.revenue, data.yesterday_same_time.revenue)}
            hint={`Yesterday in total ${formatPrice(data.yesterday.revenue)}`}
          />
          <Card
            label="Paid orders today"
            value={String(data.today.orders)}
            change={changePercent(data.today.orders, data.yesterday_same_time.orders)}
            hint={`Yesterday in total ${data.yesterday.orders}`}
          />
          <Card label="Average order value" value={formatPrice(data.today.average_order_value)} />
          <Card
            label="Orders placed today"
            value={String(data.today.orders_placed)}
            hint={`${data.last_hour_orders_placed} in the last hour, paid or not`}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Changes compare with yesterday up to the same time of day.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Paid orders per hour today</h2>
        <div className="h-44 border border-border p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourly} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} interval={1} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
              <Tooltip
                formatter={(value: number, name: string) => (name === "Revenue" ? [formatPrice(Number(value)), name] : [value, name])}
                labelFormatter={(label) => `${label}:00`}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="orders" name="Orders" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-muted-foreground">Hours after {hour}:00 are still to come.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Needs attention right now</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Attention label="Payments to confirm" count={a.payments_to_confirm} to="/admin/orders" />
          <Attention label="Deliveries to hand over" count={a.deliveries_to_hand_over} to="/admin/orders" />
          <Attention label="Returns to review" count={a.returns_to_review} to="/admin/returns" />
          <Attention label="Refunds waiting" count={a.refunds_waiting} to="/admin/returns" />
          <Attention label="New warranty tickets" count={a.new_tickets} to="/admin/warranty" />
          <Attention label="Open warranty tickets" count={a.open_tickets} to="/admin/warranty" />
          <Attention label="Out of stock" count={a.out_of_stock} to="/admin/products/inventory" />
          <Attention label="Low stock" count={a.low_stock} to="/admin/products/inventory" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Latest orders</h2>
        <ul className="border border-border divide-y divide-border text-sm">
          {data.recent_orders.length === 0 && <li className="p-4 text-muted-foreground">No orders yet.</li>}
          {data.recent_orders.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span>
                <Link to={`/admin/orders/${order.id}`} className="text-foreground">
                  {order.order_number}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {order.customer || "—"} · {new Date(order.created_at).toLocaleString()}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-muted-foreground">{formatPrice(Number(order.total))}</span>
                <StatusBadge status={order.payment_status} />
                <StatusBadge status={order.status} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default LiveMetrics;
