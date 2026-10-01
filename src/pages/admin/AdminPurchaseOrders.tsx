import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchPurchaseOrders, formatDate, STATUS_LABEL } from "@/lib/orders";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/admin/StatusBadge";

const STATUSES = ["draft", "ordered", "partially_received", "received", "cancelled"];

const AdminPurchaseOrders = () => {
  const { canManageProducts } = useAdminAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: fetchPurchaseOrders,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter(
      (order) =>
        (status === "all" || order.status === status) &&
        (!term || order.po_number.toLowerCase().includes(term) || order.supplier_name.toLowerCase().includes(term)),
    );
  }, [orders, search, status]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Purchase orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stock ordered from suppliers. Placed orders count as incoming until received.
          </p>
        </div>
        {canManageProducts && (
          <Button asChild size="sm">
            <Link to="/admin/products/purchase-orders/new">New purchase order</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search PO number or supplier"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          maxLength={100}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error.message}. Has migration 0011 been applied in Supabase?
        </p>
      )}

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3">PO</th>
              <th className="p-3">Supplier</th>
              <th className="p-3">Status</th>
              <th className="p-3">Received</th>
              <th className="p-3">Expected</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Loading purchase orders…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No purchase orders yet.
                </td>
              </tr>
            )}
            {rows.map((order) => {
              const ordered = order.purchase_order_items.reduce((sum, i) => sum + i.quantity_ordered, 0);
              const received = order.purchase_order_items.reduce((sum, i) => sum + i.quantity_received, 0);
              return (
                <tr key={order.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Link to={`/admin/products/purchase-orders/${order.id}`} className="text-foreground">
                      {order.po_number}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{order.supplier_name}</td>
                  <td className="p-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {received} / {ordered}
                  </td>
                  <td className="p-3 text-muted-foreground">{formatDate(order.expected_date)}</td>
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

export default AdminPurchaseOrders;
