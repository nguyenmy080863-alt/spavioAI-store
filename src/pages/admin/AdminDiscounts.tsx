import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminProducts } from "@/lib/catalog";
import {
  DISCOUNT_STATUS_LABEL,
  describeDiscount,
  discountStatus,
  fetchDiscounts,
  type DiscountStatus,
} from "@/lib/discounts";
import { formatDate } from "@/lib/orders";
import { formatPrice } from "@/data/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_STYLE: Record<DiscountStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-700",
  scheduled: "bg-blue-500/10 text-blue-700",
  expired: "bg-muted text-muted-foreground",
  inactive: "bg-muted text-muted-foreground",
  used_up: "bg-amber-500/10 text-amber-700",
};

const AdminDiscounts = () => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");

  const { data: discounts = [], isLoading, error } = useQuery({
    queryKey: ["discounts"],
    queryFn: fetchDiscounts,
  });
  const { data: products = [] } = useQuery({ queryKey: ["admin-products"], queryFn: fetchAdminProducts });
  const productNames = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return discounts.filter(
      (d) =>
        (status === "all" || discountStatus(d) === status) &&
        (method === "all" || d.method === method) &&
        (!term || d.name.toLowerCase().includes(term) || (d.code ?? "").toLowerCase().includes(term)),
    );
  }, [discounts, search, status, method]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Discounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discount codes, automatic discounts, Buy X Get Y and free shipping. The server applies them at checkout. The{" "}
            <Link to="/admin/discounts/flash-sale" className="text-accent">
              flash sale
            </Link>{" "}
            countdown is separate and does not change prices.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/admin/discounts/new">Create discount</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search name or code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          maxLength={100}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(DISCOUNT_STATUS_LABEL) as DiscountStatus[]).map((value) => (
              <SelectItem key={value} value={value}>
                {DISCOUNT_STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Codes and automatic</SelectItem>
            <SelectItem value="code">Codes</SelectItem>
            <SelectItem value="automatic">Automatic</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error.message}. Has migration 0017 been applied in Supabase?</p>
      )}

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3">Discount</th>
              <th className="p-3">Method</th>
              <th className="p-3">Status</th>
              <th className="p-3">Uses</th>
              <th className="p-3">Given away</th>
              <th className="p-3">Revenue</th>
              <th className="p-3">Period</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Loading discounts…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No discounts yet.
                </td>
              </tr>
            )}
            {rows.map((d) => {
              const state = discountStatus(d);
              return (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Link to={`/admin/discounts/${d.id}`} className="text-foreground">
                      {d.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{describeDiscount(d, productNames)}</span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {d.method === "code" ? <span className="font-mono text-xs">{d.code}</span> : "Automatic"}
                    {d.customer_email && <span className="block text-[11px]">Personal: {d.customer_email}</span>}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[state]}`}>
                      {DISCOUNT_STATUS_LABEL[state]}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {d.uses}
                    {d.usage_limit !== null && ` / ${d.usage_limit}`}
                  </td>
                  <td className="p-3 text-muted-foreground">{formatPrice(d.amount_given)}</td>
                  <td className="p-3 text-muted-foreground">{formatPrice(d.revenue)}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {formatDate(d.starts_at)} – {d.ends_at ? formatDate(d.ends_at) : "no end"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDiscounts;
