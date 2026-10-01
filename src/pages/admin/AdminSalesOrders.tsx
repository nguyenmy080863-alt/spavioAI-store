import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchSalesOrders, formatDate, STATUS_LABEL } from "@/lib/orders";
import { formatPrice } from "@/data/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/admin/StatusBadge";

const FILTERS = ["open", "completed", "cancelled", "unpaid", "paid"];

/** Fulfilment summary derived from deliveries. */
const fulfilment = (order: Awaited<ReturnType<typeof fetchSalesOrders>>[number]) => {
  const ordered = order.sales_order_items.reduce((sum, item) => sum + item.quantity, 0);
  const shipped = order.delivery_orders
    .filter((d) => d.status === "on_delivery" || d.status === "delivered")
    .flatMap((d) => d.delivery_order_items)
    .reduce((sum, item) => sum + item.quantity, 0);
  return { ordered, shipped };
};

const AdminSalesOrders = () => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["sales-orders"],
    queryFn: fetchSalesOrders,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter(
      (order) =>
        (filter === "all" || order.status === filter || order.payment_status === filter) &&
        (!term ||
          order.order_number.toLowerCase().includes(term) ||
          order.customer_name.toLowerCase().includes(term) ||
          order.customer_email.toLowerCase().includes(term)),
    );
  }, [orders, search, filter]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paid orders reserve stock; stock leaves when a delivery is picked up.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/admin/orders/new">New order</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search order number, name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          maxLength={100}
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All orders</SelectItem>
            {FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error.message}. Has migration 0011 been applied in Supabase?</p>
      )}

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3">Order</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Payment</th>
              <th className="p-3">Status</th>
              <th className="p-3">Shipped</th>
              <th className="p-3">Total</th>
              <th className="p-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Loading orders…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No orders yet.
                </td>
              </tr>
            )}
            {rows.map((order) => {
              const { ordered, shipped } = fulfilment(order);
              return (
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
                  <td className="p-3 text-muted-foreground">
                    {shipped} / {ordered}
                  </td>
                  <td className="p-3 text-muted-foreground">{formatPrice(Number(order.total))}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(order.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminSalesOrders;
