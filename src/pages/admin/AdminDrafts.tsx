import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DRAFT_STATE_LABEL, draftItemsValue, draftState, fetchDrafts, type DraftState } from "@/lib/drafts";
import { formatDate } from "@/lib/orders";
import { formatPrice } from "@/data/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATE_STYLE: Record<DraftState, string> = {
  open: "bg-muted text-muted-foreground",
  link_active: "bg-blue-500/10 text-blue-700",
  link_expired: "bg-amber-500/10 text-amber-700",
  awaiting_payment: "bg-violet-500/10 text-violet-700",
  completed: "bg-emerald-500/10 text-emerald-700",
};

const AdminDrafts = () => {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("active");

  const { data: drafts = [], isLoading, error } = useQuery({ queryKey: ["drafts"], queryFn: fetchDrafts });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return drafts.filter((draft) => {
      const current = draftState(draft);
      return (
        (state === "all" || (state === "active" ? current !== "completed" : current === state)) &&
        (!term ||
          draft.draft_number.toLowerCase().includes(term) ||
          draft.customer_name.toLowerCase().includes(term) ||
          draft.customer_email.toLowerCase().includes(term) ||
          draft.tags.some((tag) => tag.includes(term)))
      );
    });
  }, [drafts, search, state]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Draft orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build an order for a customer (phone, in person, wholesale quote), then create the order or send a payment
            link. Drafts are not orders: they do not count in sales, reports or stock.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/admin/orders/drafts/new">Create draft</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search draft, customer, email or tag"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          maxLength={100}
        />
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Not finished</SelectItem>
            <SelectItem value="all">All drafts</SelectItem>
            {(Object.keys(DRAFT_STATE_LABEL) as DraftState[]).map((value) => (
              <SelectItem key={value} value={value}>
                {DRAFT_STATE_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}. Has migration 0021 been applied in Supabase?</p>}

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3">Draft</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Items</th>
              <th className="p-3">Items value</th>
              <th className="p-3">Status</th>
              <th className="p-3">Tags</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Loading drafts…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No drafts yet.
                </td>
              </tr>
            )}
            {rows.map((draft) => {
              const current = draftState(draft);
              return (
                <tr key={draft.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Link to={`/admin/orders/drafts/${draft.id}`} className="text-foreground">
                      {draft.draft_number}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {draft.customer_name || draft.customer_email || "—"}
                    {draft.customer_name && <span className="block text-xs">{draft.customer_email}</span>}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {draft.draft_order_items.reduce((sum, item) => sum + item.quantity, 0)}
                  </td>
                  <td className="p-3 text-muted-foreground">{formatPrice(draftItemsValue(draft))}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${STATE_STYLE[current]}`}>
                      {DRAFT_STATE_LABEL[current]}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{draft.tags.join(", ") || "—"}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(draft.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDrafts;
