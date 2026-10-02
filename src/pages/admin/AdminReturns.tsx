import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ACTIVE_RETURN_STATUSES,
  RETURN_REASON_LABEL,
  RETURN_STATUSES,
  RETURN_STATUS_LABEL,
  fetchReturns,
} from "@/lib/returns";
import { db, formatDate, run } from "@/lib/orders";
import { logAudit } from "@/lib/audit";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { formatPrice } from "@/data/products";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/admin/StatusBadge";

const SETTING = "return_label_deduct_default";

/** Store-wide choice: do we deduct the prepaid label cost from refunds? */
const LabelCostSetting = () => {
  const queryClient = useQueryClient();
  const { roles } = useAdminAuth();
  const canEdit = roles.includes("super_admin");

  const { data: deduct = false } = useQuery({
    queryKey: ["store-setting", SETTING],
    queryFn: async () => {
      const { data, error } = await db.from("store_settings").select("value").eq("key", SETTING).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.value === true;
    },
    retry: false,
  });

  const save = useMutation({
    mutationFn: async (value: boolean) => {
      await run(db.from("store_settings").upsert({ key: SETTING, value, updated_at: new Date().toISOString() }));
      await logAudit("setting", "store_settings", SETTING, { value });
    },
    onSuccess: () => {
      toast.success("Setting saved");
      void queryClient.invalidateQueries({ queryKey: ["store-setting", SETTING] });
      void queryClient.invalidateQueries({ queryKey: ["return-policy"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="border border-border p-4 max-w-xl space-y-2">
      <label className="flex items-start gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          className="mt-1"
          checked={deduct}
          disabled={!canEdit || save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        <span>
          Deduct the prepaid return label cost from refunds
          <span className="block text-xs text-muted-foreground">
            Off (default): we pay the label. On: the label cost is deducted when the label is created, except for
            defective or wrong items. The return page tells customers before they return. Update your terms when you
            switch this on. {!canEdit && "Only a Super Admin can change this."}
          </span>
        </span>
      </label>
    </div>
  );
};

const AdminReturns = () => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");

  const { data: returns = [], isLoading, error } = useQuery({
    queryKey: ["returns"],
    queryFn: fetchReturns,
  });

  const counts = useMemo(
    () => ({
      requested: returns.filter((r) => r.status === "requested").length,
      toReceive: returns.filter((r) => r.status === "approved").length,
      toRefund: returns.filter((r) => r.status === "received").length,
    }),
    [returns],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return returns.filter(
      (entry) =>
        (status === "all" ||
          (status === "active" ? ACTIVE_RETURN_STATUSES.includes(entry.status) : entry.status === status)) &&
        (!term ||
          entry.return_number.toLowerCase().includes(term) ||
          entry.customer_name.toLowerCase().includes(term) ||
          entry.customer_email.toLowerCase().includes(term) ||
          (entry.sales_orders?.order_number ?? "").toLowerCase().includes(term)),
    );
  }, [returns, search, status]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-light text-foreground">Returns</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Return requests within the 30-day trial. Approve, receive the parcel, then refund.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        {[
          ["To review", counts.requested],
          ["Waiting for parcel", counts.toReceive],
          ["To refund", counts.toRefund],
        ].map(([label, value]) => (
          <div key={label} className="border border-border p-4">
            <p className="text-2xl font-light text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      <LabelCostSetting />

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search return, order, customer or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
          maxLength={100}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Needs work</SelectItem>
            <SelectItem value="all">All returns</SelectItem>
            {RETURN_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {RETURN_STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error.message}. Has migration 0015 been applied in Supabase?</p>
      )}

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3">Return</th>
              <th className="p-3">Order</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Items</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Refund</th>
              <th className="p-3">Status</th>
              <th className="p-3">Requested</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  Loading returns…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  No returns match.
                </td>
              </tr>
            )}
            {rows.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <Link to={`/admin/returns/${entry.id}`} className="text-foreground">
                    {entry.return_number}
                  </Link>
                  {entry.resolution === "exchange" && (
                    <span className="ml-2 text-[11px] text-violet-700">Exchange</span>
                  )}
                </td>
                <td className="p-3">
                  <Link to={`/admin/orders/${entry.sales_order_id}`} className="text-muted-foreground">
                    {entry.sales_orders?.order_number ?? "—"}
                  </Link>
                </td>
                <td className="p-3 text-muted-foreground">
                  {entry.customer_name || entry.customer_email}
                  <span className="block text-xs">{entry.customer_email}</span>
                </td>
                <td className="p-3 text-muted-foreground">
                  {entry.return_items.reduce((sum, item) => sum + item.quantity, 0)}
                </td>
                <td className="p-3 text-muted-foreground">{RETURN_REASON_LABEL[entry.reason]}</td>
                <td className="p-3 text-muted-foreground">{formatPrice(Number(entry.refund_amount))}</td>
                <td className="p-3">
                  <StatusBadge status={entry.status} />
                </td>
                <td className="p-3 text-muted-foreground">{formatDate(entry.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminReturns;
