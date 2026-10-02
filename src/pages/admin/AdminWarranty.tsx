import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ACTIVE_STATUSES,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  TICKET_TYPE_LABEL,
  TICKET_TYPES,
  fetchTickets,
  warrantyState,
} from "@/lib/warranty";
import { formatDate } from "@/lib/orders";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/admin/StatusBadge";
import WarrantyStateBadge from "@/components/admin/WarrantyStateBadge";

const AdminWarranty = () => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [type, setType] = useState("all");

  const { data: tickets = [], isLoading, error } = useQuery({
    queryKey: ["warranty-tickets"],
    queryFn: fetchTickets,
  });

  const counts = useMemo(
    () => ({
      open: tickets.filter((t) => t.status === "open").length,
      awaiting: tickets.filter((t) => t.status === "awaiting_customer").length,
      visits: tickets.filter((t) => t.status === "visit_scheduled").length,
    }),
    [tickets],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter(
      (ticket) =>
        (status === "all" ||
          (status === "active" ? ACTIVE_STATUSES.includes(ticket.status) : ticket.status === status)) &&
        (type === "all" || ticket.type === type) &&
        (!term ||
          ticket.ticket_number.toLowerCase().includes(term) ||
          ticket.customer_name.toLowerCase().includes(term) ||
          ticket.customer_email.toLowerCase().includes(term) ||
          ticket.subject.toLowerCase().includes(term) ||
          ticket.serial_number.toLowerCase().includes(term)),
    );
  }, [tickets, search, status, type]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-light text-foreground">Warranty</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Support tickets from customers and guests: guidance requests and product defects.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        {[
          ["New", counts.open],
          ["Awaiting customer", counts.awaiting],
          ["Visits scheduled", counts.visits],
        ].map(([label, value]) => (
          <div key={label} className="border border-border p-4">
            <p className="text-2xl font-light text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search ticket, customer, subject or serial number"
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
            <SelectItem value="all">All tickets</SelectItem>
            {TICKET_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {TICKET_STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TICKET_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {TICKET_TYPE_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error.message}. Has migration 0012 been applied in Supabase?</p>
      )}

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3">Ticket</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Type</th>
              <th className="p-3">Warranty</th>
              <th className="p-3">Status</th>
              <th className="p-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Loading tickets…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No tickets match.
                </td>
              </tr>
            )}
            {rows.map((ticket) => (
              <tr key={ticket.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <Link to={`/admin/warranty/${ticket.id}`} className="text-foreground">
                    {ticket.ticket_number}
                  </Link>
                  {ticket.priority === "high" && <span className="ml-2 text-[11px] text-destructive">High</span>}
                </td>
                <td className="p-3 text-muted-foreground">
                  {ticket.customer_name}
                  <span className="block text-xs">{ticket.customer_email}</span>
                </td>
                <td className="p-3 text-muted-foreground max-w-xs truncate">{ticket.subject}</td>
                <td className="p-3 text-muted-foreground">{TICKET_TYPE_LABEL[ticket.type]}</td>
                <td className="p-3">
                  <WarrantyStateBadge state={warrantyState(ticket)} />
                </td>
                <td className="p-3">
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="p-3 text-muted-foreground">{formatDate(ticket.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminWarranty;
