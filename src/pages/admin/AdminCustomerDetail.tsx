import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  SOURCE_LABEL,
  anonymiseCustomer,
  downloadFile,
  fetchCustomer,
  fetchCustomerActivity,
  parseTags,
  type Customer,
} from "@/lib/customers";
import { db, formatDate, run } from "@/lib/orders";
import { formatDateTime } from "@/lib/warranty";
import { logAudit } from "@/lib/audit";
import { formatPrice } from "@/data/products";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "@/components/admin/StatusBadge";

const CustomerForm = ({ customer, onSaved }: { customer: Customer; onSaved: () => void }) => {
  const [name, setName] = useState(customer.full_name);
  const [phone, setPhone] = useState(customer.phone);
  const [tags, setTags] = useState(customer.tags.join(", "));
  const [notes, setNotes] = useState(customer.notes);
  const [consent, setConsent] = useState(customer.marketing_consent);

  useEffect(() => {
    setName(customer.full_name);
    setPhone(customer.phone);
    setTags(customer.tags.join(", "));
    setNotes(customer.notes);
    setConsent(customer.marketing_consent);
  }, [customer]);

  const save = useMutation({
    mutationFn: async () => {
      const consentChanged = consent !== customer.marketing_consent;
      await run(
        db
          .from("customers")
          .update({
            full_name: name.trim(),
            phone: phone.trim(),
            tags: parseTags(tags),
            notes: notes.trim(),
            marketing_consent: consent,
            ...(consentChanged
              ? {
                  marketing_consent_at: consent ? new Date().toISOString() : null,
                  marketing_consent_source: consent ? "admin" : "",
                }
              : {}),
          })
          .eq("id", customer.id),
      );
      await logAudit("update", "customer", customer.id, { consent_changed: consentChanged, marketing_consent: consent });
    },
    onSuccess: () => {
      toast.success("Customer saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="border border-border p-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cd-name">Name</Label>
          <Input id="cd-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cd-phone">Phone</Label>
          <Input id="cd-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cd-tags">Tags</Label>
        <Input
          id="cd-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="vip, press, sensitive-skin"
          maxLength={300}
        />
        <p className="text-xs text-muted-foreground">Separate tags with commas.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cd-notes">Internal notes</Label>
        <Textarea id="cd-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />
      </div>
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Agreed to marketing emails
        </label>
        <p className="text-xs text-muted-foreground">
          {customer.marketing_consent && customer.marketing_consent_at
            ? `Agreed on ${formatDateTime(customer.marketing_consent_at)} (${customer.marketing_consent_source || "unknown source"}).`
            : "No consent on record."}{" "}
          Only tick this if the customer told you they agree.
        </p>
      </div>
      <Button type="submit" size="sm" disabled={save.isPending}>
        Save changes
      </Button>
    </form>
  );
};

const AdminCustomerDetail = () => {
  const { customerId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles } = useAdminAuth();
  const isSuperAdmin = roles.includes("super_admin");

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => fetchCustomer(customerId),
  });
  const { data: activity } = useQuery({
    queryKey: ["customer-activity", customer?.email],
    queryFn: () => fetchCustomerActivity(customer!.email),
    enabled: !!customer && !customer.anonymised_at,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
    void queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
  };

  const anonymise = useMutation({
    mutationFn: async () => {
      await anonymiseCustomer(customerId);
      await logAudit("anonymise", "customer", customerId);
    },
    onSuccess: () => {
      toast.success("Customer anonymised");
      refresh();
      navigate("/admin/customers");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading customer…</p>;
  if (error || !customer) return <p className="text-sm text-destructive">{error?.message ?? "Customer not found"}</p>;

  const orders = activity?.orders ?? [];
  const tickets = activity?.tickets ?? [];
  const purchases = orders.filter((o) => o.payment_status === "paid" && o.status !== "cancelled");
  const spent = purchases.reduce((sum, o) => sum + Number(o.total), 0);

  const exportData = () => {
    downloadFile(
      `customer-${customer.id}.json`,
      JSON.stringify({ customer, orders, warranty_tickets: tickets }, null, 2),
      "application/json",
    );
    void logAudit("export", "customer", customer.id, { kind: "personal_data" });
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <p className="text-xs text-muted-foreground mb-1">
          <Link to="/admin/customers">Customers</Link>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-light text-foreground">
            {customer.anonymised_at ? "Anonymised customer" : customer.full_name || customer.email}
          </h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {customer.user_id ? "Has account" : "Guest"}
          </span>
          {customer.marketing_consent && (
            <span className="rounded-full bg-emerald-500/10 text-emerald-700 px-2 py-0.5 text-[11px]">Subscribed</span>
          )}
        </div>
        {!customer.anonymised_at && (
          <p className="text-xs text-muted-foreground mt-1">
            {customer.email} · {SOURCE_LABEL[customer.source]} · Customer since {formatDate(customer.created_at)}
          </p>
        )}
      </div>

      {customer.anonymised_at ? (
        <p className="text-sm text-muted-foreground">
          Personal data was removed on {formatDateTime(customer.anonymised_at)}. Orders stay in the order list for
          bookkeeping.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 max-w-xl">
            {[
              ["Paid orders", purchases.length],
              ["Total spent", formatPrice(spent)],
              ["Open tickets", tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length],
            ].map(([label, value]) => (
              <div key={label} className="border border-border p-4">
                <p className="text-xl font-light text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
          </div>

          <CustomerForm customer={customer} onSaved={refresh} />

          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">Orders</h2>
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders with this email.</p>
              ) : (
                <ul className="border border-border divide-y divide-border text-sm">
                  {orders.map((order) => (
                    <li key={order.id} className="flex items-center justify-between gap-3 p-3">
                      <span>
                        <Link to={`/admin/orders/${order.id}`} className="text-foreground">
                          {order.order_number}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(order.created_at)} · {formatPrice(Number(order.total))}
                        </span>
                      </span>
                      <span className="flex gap-2">
                        <StatusBadge status={order.payment_status} />
                        <StatusBadge status={order.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">Warranty tickets</h2>
              {tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tickets with this email.</p>
              ) : (
                <ul className="border border-border divide-y divide-border text-sm">
                  {tickets.map((ticket) => (
                    <li key={ticket.id} className="flex items-center justify-between gap-3 p-3">
                      <span className="min-w-0">
                        <Link to={`/admin/warranty/${ticket.id}`} className="text-foreground">
                          {ticket.ticket_number}
                        </Link>
                        <span className="block text-xs text-muted-foreground truncate">{ticket.subject}</span>
                      </span>
                      <StatusBadge status={ticket.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="border border-border p-5 space-y-3">
            <h2 className="text-sm font-medium text-foreground">Privacy</h2>
            <p className="text-xs text-muted-foreground">
              Download everything stored about this customer, or remove their personal data on request. Anonymising
              wipes the name, email, phone, notes and consent, and the contact details on warranty tickets. Orders are
              kept for bookkeeping.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="sm" variant="outline" onClick={exportData}>
                Download data (JSON)
              </Button>
              {isSuperAdmin && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={anonymise.isPending}
                  onClick={() => {
                    if (window.confirm("Anonymise this customer? This cannot be undone.")) anonymise.mutate();
                  }}
                >
                  Anonymise customer
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminCustomerDetail;
