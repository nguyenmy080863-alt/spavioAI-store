import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DEFAULT_HIGH_SPENDER_THRESHOLD,
  SEGMENTS,
  SOURCE_LABEL,
  customersToCsv,
  downloadFile,
  fetchCustomers,
  inSegment,
  type SegmentId,
} from "@/lib/customers";
import { db, formatDate } from "@/lib/orders";
import { logAudit } from "@/lib/audit";
import { formatPrice } from "@/data/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NewCustomerForm = ({ onDone }: { onDone: () => void }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const address = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new Error("Enter a valid email address");
      const { data, error } = await db
        .from("customers")
        .insert({ email: address, full_name: name.trim(), phone: phone.trim(), source: "manual" })
        .select("id")
        .single();
      if (error) {
        throw new Error(error.code === "23505" ? "A customer with this email already exists" : error.message);
      }
      await logAudit("create", "customer", data.id, { email: address });
    },
    onSuccess: () => {
      toast.success("Customer added");
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="border border-border p-5 grid gap-4 sm:grid-cols-4 items-end"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="c-name">Name</Label>
        <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-email">Email</Label>
        <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-phone">Phone</Label>
        <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>
          Add customer
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

const AdminCustomers = () => {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<SegmentId>("all");
  const [threshold, setThreshold] = useState(String(DEFAULT_HIGH_SPENDER_THRESHOLD));
  const [consentOnly, setConsentOnly] = useState(true);
  const [adding, setAdding] = useState(false);

  const { data: customers = [], isLoading, error } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
  });

  const limit = Number(threshold) > 0 ? Number(threshold) : DEFAULT_HIGH_SPENDER_THRESHOLD;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter(
      (row) =>
        inSegment(row, segment, limit) &&
        (!term ||
          row.email.toLowerCase().includes(term) ||
          row.full_name.toLowerCase().includes(term) ||
          row.phone.toLowerCase().includes(term) ||
          row.tags.some((tag) => tag.includes(term))),
    );
  }, [customers, search, segment, limit]);

  const exportRows = consentOnly ? rows.filter((row) => row.marketing_consent && !row.anonymised_at) : rows;
  const activeSegment = SEGMENTS.find((entry) => entry.id === segment);

  const exportCsv = () => {
    downloadFile(`customers-${segment}-${new Date().toISOString().slice(0, 10)}.csv`, customersToCsv(exportRows), "text/csv");
    void logAudit("export", "customer", null, { segment, count: exportRows.length, consent_only: consentOnly });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everyone who ordered, signed up, opened a warranty ticket or was added by hand: one record per email.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add customer
        </Button>
      </div>

      {adding && <NewCustomerForm onDone={() => setAdding(false)} />}

      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Search name, email, phone or tag"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          maxLength={100}
        />
        <Select value={segment} onValueChange={(value) => setSegment(value as SegmentId)}>
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEGMENTS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {segment === "high_spenders" && (
          <div className="flex items-center gap-2">
            <Label htmlFor="threshold" className="text-xs text-muted-foreground">
              Spent at least (EUR)
            </Label>
            <Input
              id="threshold"
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-24"
            />
          </div>
        )}
      </div>
      {activeSegment && segment !== "all" && <p className="text-xs text-muted-foreground -mt-4">{activeSegment.hint}</p>}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-muted-foreground">
          {rows.length} {rows.length === 1 ? "customer" : "customers"}
        </span>
        <Button size="sm" variant="outline" disabled={exportRows.length === 0} onClick={exportCsv}>
          Export CSV ({exportRows.length})
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={consentOnly} onChange={(e) => setConsentOnly(e.target.checked)} />
          Only customers who agreed to marketing emails
        </label>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error.message}. Has migration 0013 been applied in Supabase?</p>
      )}

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3">Customer</th>
              <th className="p-3">Account</th>
              <th className="p-3">Marketing</th>
              <th className="p-3">Orders</th>
              <th className="p-3">Spent</th>
              <th className="p-3">Last purchase</th>
              <th className="p-3">Tags</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Loading customers…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No customers match.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <Link to={`/admin/customers/${row.id}`} className="text-foreground">
                    {row.anonymised_at ? "Anonymised customer" : row.full_name || row.email}
                  </Link>
                  {!row.anonymised_at && row.full_name && (
                    <span className="block text-xs text-muted-foreground">{row.email}</span>
                  )}
                  <span className="block text-[11px] text-muted-foreground">
                    {SOURCE_LABEL[row.source]} · {formatDate(row.created_at)}
                  </span>
                </td>
                <td className="p-3 text-muted-foreground">{row.user_id ? "Account" : "Guest"}</td>
                <td className="p-3 text-muted-foreground">{row.marketing_consent ? "Subscribed" : "No"}</td>
                <td className="p-3 text-muted-foreground">
                  {row.purchases_count}
                  {row.open_tickets > 0 && (
                    <span className="block text-[11px] text-amber-700">{row.open_tickets} open ticket(s)</span>
                  )}
                </td>
                <td className="p-3 text-muted-foreground">{formatPrice(row.total_spent)}</td>
                <td className="p-3 text-muted-foreground">{formatDate(row.last_purchase_at)}</td>
                <td className="p-3 text-xs text-muted-foreground">{row.tags.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminCustomers;
