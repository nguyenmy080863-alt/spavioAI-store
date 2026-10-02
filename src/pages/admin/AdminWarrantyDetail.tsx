import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  TICKET_TYPE_LABEL,
  fetchTicket,
  fetchTicketMessages,
  formatDateTime,
  toLocalInput,
  warrantyState,
  type TicketPriority,
  type TicketStatus,
  type WarrantyTicket,
} from "@/lib/warranty";
import { db, formatDate, run } from "@/lib/orders";
import { logAudit } from "@/lib/audit";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/admin/StatusBadge";
import WarrantyStateBadge from "@/components/admin/WarrantyStateBadge";

const PRIORITIES: TicketPriority[] = ["low", "normal", "high"];

/** Editable ticket fields, kept as form strings until saved. */
const TicketControls = ({ ticket, onSaved }: { ticket: WarrantyTicket; onSaved: () => void }) => {
  const { user } = useAdminAuth();
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [visitAt, setVisitAt] = useState(toLocalInput(ticket.visit_scheduled_at));
  const [visitNotes, setVisitNotes] = useState(ticket.visit_notes);
  const [resolution, setResolution] = useState(ticket.resolution);

  useEffect(() => {
    setStatus(ticket.status);
    setPriority(ticket.priority);
    setVisitAt(toLocalInput(ticket.visit_scheduled_at));
    setVisitNotes(ticket.visit_notes);
    setResolution(ticket.resolution);
  }, [ticket]);

  const save = useMutation({
    mutationFn: async (extra: Partial<WarrantyTicket> = {}) => {
      if (status === "visit_scheduled" && !visitAt) throw new Error("Set a visit date and time first");
      const patch = {
        status,
        priority,
        visit_scheduled_at: visitAt ? new Date(visitAt).toISOString() : null,
        visit_notes: visitNotes.trim(),
        resolution: resolution.trim(),
        ...extra,
      };
      await run(db.from("warranty_tickets").update(patch).eq("id", ticket.id));
      await logAudit("update", "warranty_ticket", ticket.id, {
        ticket_number: ticket.ticket_number,
        from_status: ticket.status,
        to_status: patch.status,
      });
    },
    onSuccess: () => {
      toast.success("Ticket updated");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="border border-border p-5 space-y-4">
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={status} onValueChange={(value) => setStatus(value as TicketStatus)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TICKET_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {TICKET_STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Priority</Label>
        <Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="visit-at">Visit date and time</Label>
        <Input id="visit-at" type="datetime-local" value={visitAt} onChange={(e) => setVisitAt(e.target.value)} />
        <Textarea
          value={visitNotes}
          onChange={(e) => setVisitNotes(e.target.value)}
          placeholder="Visit notes (address, what to bring)"
          rows={2}
          maxLength={1000}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Resolution (shown to the customer)</Label>
        <Textarea
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="What was done to solve the problem"
          rows={3}
          maxLength={2000}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({})}>
          Save changes
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={save.isPending || ticket.assigned_to === user?.id}
          onClick={() => save.mutate({ assigned_to: user?.id ?? null })}
        >
          {ticket.assigned_to === user?.id ? "Assigned to you" : "Assign to me"}
        </Button>
      </div>
    </div>
  );
};

const AdminWarrantyDetail = () => {
  const { ticketId = "" } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAdminAuth();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ["warranty-ticket", ticketId],
    queryFn: () => fetchTicket(ticketId),
  });
  const { data: messages = [] } = useQuery({
    queryKey: ["warranty-messages", ticketId],
    queryFn: () => fetchTicketMessages(ticketId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["warranty-tickets"] });
    void queryClient.invalidateQueries({ queryKey: ["warranty-ticket", ticketId] });
    void queryClient.invalidateQueries({ queryKey: ["warranty-messages", ticketId] });
  };

  const send = useMutation({
    mutationFn: async () => {
      const body = reply.trim();
      if (!body) throw new Error("Write a message first");
      await run(
        db.from("warranty_messages").insert({
          ticket_id: ticketId,
          author_type: "staff",
          author_id: user?.id ?? null,
          author_name: user?.email ?? "Spavio support",
          body,
          is_internal: internal,
        }),
      );
      // A first public reply moves a new ticket into review.
      if (!internal && ticket?.status === "open") {
        await run(db.from("warranty_tickets").update({ status: "in_review" }).eq("id", ticketId));
      }
    },
    onSuccess: () => {
      setReply("");
      setInternal(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading ticket…</p>;
  if (error || !ticket) {
    return <p className="text-sm text-destructive">{error?.message ?? "Ticket not found"}</p>;
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <p className="text-xs text-muted-foreground mb-1">
          <Link to="/admin/warranty">Warranty</Link>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-light text-foreground">{ticket.ticket_number}</h1>
          <StatusBadge status={ticket.status} />
          <WarrantyStateBadge state={warrantyState(ticket)} />
        </div>
        <p className="text-sm text-foreground mt-2">{ticket.subject}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          <div className="border border-border p-5 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ["Customer", ticket.customer_name],
              ["Email", ticket.customer_email],
              ["Account", ticket.customer_id ? "Signed-in customer" : "Guest"],
              ["Type", TICKET_TYPE_LABEL[ticket.type]],
              ["Product", ticket.product_name || "—"],
              ["Serial number", ticket.serial_number || "—"],
              ["Order number given", ticket.order_number_given || "—"],
              [
                "Warranty until",
                ticket.warranty_expires_at ? formatDate(ticket.warranty_expires_at) : "—",
              ],
              ["Opened", formatDateTime(ticket.created_at)],
              ["Visit", formatDateTime(ticket.visit_scheduled_at)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-foreground break-words">{value}</p>
              </div>
            ))}
            {ticket.sales_order_id && (
              <div className="sm:col-span-2">
                <Link to={`/admin/orders/${ticket.sales_order_id}`} className="text-xs text-accent">
                  Open matched order →
                </Link>
              </div>
            )}
            {!ticket.purchase_verified && (
              <p className="sm:col-span-2 text-xs text-amber-700">
                The order number and email did not match any order. Check the purchase by hand before promising a
                free repair.
              </p>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-medium text-foreground">Conversation</h2>
            <div className="border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">
                {ticket.customer_name} · {formatDateTime(ticket.created_at)}
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
            </div>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`border p-4 ${
                  message.is_internal
                    ? "border-amber-500/40 bg-amber-500/5"
                    : message.author_type === "staff"
                      ? "border-primary/30 bg-primary/5"
                      : "border-border"
                }`}
              >
                <p className="text-xs text-muted-foreground mb-1">
                  {message.author_name || (message.author_type === "staff" ? "Support" : "Customer")} ·{" "}
                  {formatDateTime(message.created_at)}
                  {message.is_internal && " · Internal note (not visible to the customer)"}
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{message.body}</p>
              </div>
            ))}

            <div className="space-y-3">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={internal ? "Internal note for your team" : "Reply to the customer"}
                rows={4}
                maxLength={4000}
              />
              <div className="flex flex-wrap items-center gap-4">
                <Button size="sm" disabled={send.isPending || !reply.trim()} onClick={() => send.mutate()}>
                  {internal ? "Add note" : "Send reply"}
                </Button>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                  Internal note
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Replies are not emailed yet. Customers see them on the ticket page or in their account.
              </p>
            </div>
          </div>
        </div>

        <TicketControls ticket={ticket} onSaved={refresh} />
      </div>
    </div>
  );
};

export default AdminWarrantyDetail;
