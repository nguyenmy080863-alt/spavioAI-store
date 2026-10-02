import { db, run } from "@/lib/orders";

export type TicketType = "guidance" | "defect" | "other";
export type TicketStatus = "open" | "in_review" | "awaiting_customer" | "visit_scheduled" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high";

export const TICKET_TYPES: TicketType[] = ["guidance", "defect", "other"];
export const TICKET_STATUSES: TicketStatus[] = [
  "open",
  "in_review",
  "awaiting_customer",
  "visit_scheduled",
  "resolved",
  "closed",
];

/** Statuses where the ticket still needs work. */
export const ACTIVE_STATUSES: TicketStatus[] = ["open", "in_review", "awaiting_customer", "visit_scheduled"];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_review: "In review",
  awaiting_customer: "Awaiting customer",
  visit_scheduled: "Visit scheduled",
  resolved: "Resolved",
  closed: "Closed",
};

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  guidance: "Guidance",
  defect: "Defect",
  other: "Other",
};

/** Staff view of a ticket (full row). */
export interface WarrantyTicket {
  id: string;
  ticket_number: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  customer_id: string | null;
  customer_name: string;
  customer_email: string;
  sales_order_id: string | null;
  order_number_given: string;
  purchase_verified: boolean;
  warranty_expires_at: string | null;
  product_name: string;
  serial_number: string;
  subject: string;
  description: string;
  assigned_to: string | null;
  visit_scheduled_at: string | null;
  visit_notes: string;
  resolution: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarrantyMessage {
  id: string;
  ticket_id: string;
  author_type: "customer" | "staff";
  author_name: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

/** What a customer or guest sees: no priority, assignee or internal notes. */
export interface PublicTicket {
  ticket_number: string;
  type: TicketType;
  status: TicketStatus;
  subject: string;
  description: string;
  product_name: string;
  serial_number: string;
  purchase_verified: boolean;
  warranty_expires_at: string | null;
  visit_scheduled_at: string | null;
  resolution: string;
  created_at: string;
  updated_at: string;
  messages: { author_type: "customer" | "staff"; author_name: string; body: string; created_at: string }[];
}

export interface NewTicketInput {
  type: TicketType;
  name: string;
  email: string;
  orderNumber: string;
  productName: string;
  serialNumber: string;
  subject: string;
  description: string;
}

export type WarrantyState = "verified_active" | "verified_expired" | "not_started" | "unverified";

/** Warranty standing of a ticket, derived from the matched order's delivery date. */
export const warrantyState = (ticket: Pick<WarrantyTicket, "purchase_verified" | "warranty_expires_at">): WarrantyState => {
  if (!ticket.purchase_verified) return "unverified";
  if (!ticket.warranty_expires_at) return "not_started";
  return new Date(ticket.warranty_expires_at) > new Date() ? "verified_active" : "verified_expired";
};

export const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

/** Value for a datetime-local input (local time, no seconds). */
export const toLocalInput = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

// --- Customer / guest side (SECURITY DEFINER functions in migration 0012) ---

export const createTicket = async (input: NewTicketInput): Promise<{ ticket_number: string; purchase_verified: boolean }> =>
  unwrap(
    await db.rpc("create_warranty_ticket", {
      p_type: input.type,
      p_name: input.name,
      p_email: input.email,
      p_order_number: input.orderNumber,
      p_product_name: input.productName,
      p_serial_number: input.serialNumber,
      p_subject: input.subject,
      p_description: input.description,
    }),
  );

export const fetchPublicTicket = async (ticketNumber: string, email: string): Promise<PublicTicket | null> =>
  unwrap(await db.rpc("get_warranty_ticket", { p_ticket_number: ticketNumber, p_email: email || null }));

export const addCustomerMessage = (ticketNumber: string, email: string, body: string) =>
  run(db.rpc("add_warranty_message", { p_ticket_number: ticketNumber, p_email: email || null, p_body: body }));

/** Tickets of the signed-in customer (staff would otherwise see every ticket through RLS). */
export const fetchMyTickets = async (userId: string): Promise<WarrantyTicket[]> =>
  unwrap(
    await db.from("warranty_tickets").select("*").eq("customer_id", userId).order("created_at", { ascending: false }),
  );

// --- Staff side ---

/** Every ticket, newest first (staff only; RLS returns nothing for other users). */
export const fetchTickets = async (): Promise<WarrantyTicket[]> =>
  unwrap(await db.from("warranty_tickets").select("*").order("created_at", { ascending: false }));

export const fetchTicket = async (id: string): Promise<WarrantyTicket> =>
  unwrap(await db.from("warranty_tickets").select("*").eq("id", id).single());

export const fetchTicketMessages = async (ticketId: string): Promise<WarrantyMessage[]> =>
  unwrap(
    await db.from("warranty_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true }),
  );
