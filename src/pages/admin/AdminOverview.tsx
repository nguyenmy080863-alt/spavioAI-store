import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminProducts } from "@/lib/catalog";
import { fetchPurchaseOrders, fetchSalesOrders, formatDate, type SalesOrder } from "@/lib/orders";
import { formatPrice } from "@/data/products";
import StatusBadge from "@/components/admin/StatusBadge";

const DAY = 24 * 60 * 60 * 1000;

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Revenue = orders paid in the window that were not cancelled. */
const summarize = (orders: SalesOrder[], from: number, to: number) => {
  const inWindow = (value: string | null) => {
    if (!value) return false;
    const time = new Date(value).getTime();
    return time >= from && time < to;
  };
  const created = orders.filter((o) => o.status !== "cancelled" && inWindow(o.created_at)).length;
  const paid = orders.filter((o) => o.status !== "cancelled" && o.payment_status === "paid" && inWindow(o.paid_at));
  const revenue = paid.reduce((sum, o) => sum + Number(o.total), 0);
  return { orders: created, revenue, average: paid.length ? revenue / paid.length : 0 };
};

const Delta = ({ current, previous }: { current: number; previous: number }) => {
  if (previous === 0) return <span className="text-xs text-muted-foreground">{current === 0 ? "—" : "new"}</span>;
  const change = Math.round(((current - previous) / previous) * 100);
  return (
    <span className={`text-xs ${change < 0 ? "text-destructive" : "text-emerald-700"}`}>
      {change > 0 ? "+" : ""}
      {change}% vs previous
    </span>
  );
};

const AdminOverview = () => {
  const { data: orders, error: ordersError } = useQuery({ queryKey: ["sales-orders"], queryFn: fetchSalesOrders });
  const { data: purchaseOrders } = useQuery({ queryKey: ["purchase-orders"], queryFn: fetchPurchaseOrders });
  const { data: products = [] } = useQuery({ queryKey: ["admin-products"], queryFn: fetchAdminProducts });

  const attention = useMemo(() => {
    const open = (orders ?? []).filter((o) => o.status === "open");
    const toFulfil = open.filter((o) => {
      if (o.payment_status !== "paid") return false;
      const planned = o.delivery_orders
        .filter((d) => d.status !== "cancelled")
        .flatMap((d) => d.delivery_order_items)
        .reduce((sum, di) => sum + di.quantity, 0);
      return planned < o.sales_order_items.reduce((sum, i) => sum + i.quantity, 0);
    }).length;
    const preparing = (orders ?? []).flatMap((o) => o.delivery_orders).filter((d) => d.status === "preparing").length;
    const unpaid = open.filter(
      (o) => o.payment_status === "unpaid" && Date.now() - new Date(o.created_at).getTime() > DAY,
    ).length;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = (purchaseOrders ?? []).filter(
      (po) => (po.status === "ordered" || po.status === "partially_received") && po.expected_date && po.expected_date < today,
    ).length;
    const active = products.filter((p) => !p.archived_at);
    return {
      toFulfil,
      preparing,
      unpaid,
      overdue,
      outOfStock: active.filter((p) => p.stock <= 0).length,
      lowStock: active.filter((p) => p.stock > 0 && p.stock <= p.low_stock_threshold).length,
    };
  }, [orders, purchaseOrders, products]);

  const periods = useMemo(() => {
    const today = startOfToday();
    return [
      { label: "Today", days: 1 },
      { label: "Last 7 days", days: 7 },
      { label: "Last 30 days", days: 30 },
    ].map(({ label, days }) => {
      // "Today" is the calendar day; longer ranges end now.
      const end = days === 1 ? today + DAY : Date.now();
      const start = days === 1 ? today : end - days * DAY;
      return {
        label,
        current: summarize(orders ?? [], start, end),
        previous: summarize(orders ?? [], start - days * DAY, start),
      };
    });
  }, [orders]);

  const cards = [
    { label: "Paid orders to fulfil", value: attention.toFulfil, to: "/admin/orders" },
    { label: "Deliveries to hand over", value: attention.preparing, to: "/admin/orders" },
    { label: "Unpaid for over 24 h", value: attention.unpaid, to: "/admin/orders" },
    { label: "Overdue purchase orders", value: attention.overdue, to: "/admin/products/purchase-orders" },
    { label: "Out of stock", value: attention.outOfStock, to: "/admin/products/inventory" },
    { label: "Low stock", value: attention.lowStock, to: "/admin/products/inventory" },
  ];
  const recent = (orders ?? []).slice(0, 5);

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-xl font-light text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">What needs your attention today.</p>
      </div>

      {ordersError && (
        <p className="text-sm text-destructive">
          Orders could not be loaded: {ordersError.message}. Has migration 0011 been applied in Supabase?
        </p>
      )}

      <section>
        <h2 className="text-sm font-light text-foreground mb-4">Needs attention</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Link
              key={card.label}
              to={card.to}
              className="border border-border p-4 transition-colors hover:bg-muted"
            >
              <p className="text-xs font-light text-muted-foreground">{card.label}</p>
              <p className={`mt-1 text-2xl font-light ${card.value > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                {card.value}
              </p>
              {card.value === 0 && <p className="text-[11px] text-muted-foreground">All clear</p>}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-light text-foreground mb-4">Sales summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {periods.map((period) => (
            <div key={period.label} className="border border-border p-4 space-y-3">
              <p className="text-xs font-light text-muted-foreground">{period.label}</p>
              <div>
                <p className="text-2xl font-light text-foreground">{formatPrice(period.current.revenue)}</p>
                <Delta current={period.current.revenue} previous={period.previous.revenue} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{period.current.orders} orders</span>
                <span>Avg {formatPrice(period.current.average)}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Revenue counts paid orders that were not cancelled.</p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-light text-foreground">Recent orders</h2>
          <Link to="/admin/orders" className="text-xs text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>
        <div className="border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-muted-foreground">No orders yet.</td>
                </tr>
              )}
              {recent.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Link to={`/admin/orders/${order.id}`} className="text-foreground">
                      {order.order_number}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{order.customer_name || order.customer_email || "—"}</td>
                  <td className="p-3">
                    <StatusBadge status={order.payment_status} />
                  </td>
                  <td className="p-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="p-3 text-muted-foreground">{formatPrice(Number(order.total))}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(order.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminOverview;
