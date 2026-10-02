import { db, run } from "@/lib/orders";

export interface Customer {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  user_id: string | null;
  source: "order" | "signup" | "warranty" | "manual";
  tags: string[];
  notes: string;
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  marketing_consent_source: string;
  anonymised_at: string | null;
  created_at: string;
}

export interface CustomerStats {
  customer_id: string;
  orders_count: number;
  purchases_count: number;
  total_spent: number;
  last_purchase_at: string | null;
  open_tickets: number;
}

export interface CustomerRow extends Customer, Omit<CustomerStats, "customer_id"> {}

export const SOURCE_LABEL: Record<Customer["source"], string> = {
  order: "Order",
  signup: "Account sign-up",
  warranty: "Warranty ticket",
  manual: "Added by hand",
};

/** Segments are filters on the customer statistics. More are added here later. */
export type SegmentId = "all" | "high_spenders" | "lapsed";

export const DEFAULT_HIGH_SPENDER_THRESHOLD = 500;
export const LAPSED_DAYS = 180;

export const SEGMENTS: { id: SegmentId; label: string; hint: string }[] = [
  { id: "all", label: "All customers", hint: "Everyone with a customer record." },
  {
    id: "high_spenders",
    label: "High spenders",
    hint: "Total paid orders at or above the amount below (shipping included, cancelled and refunded orders excluded).",
  },
  {
    id: "lapsed",
    label: `No purchase in ${LAPSED_DAYS} days`,
    hint: `Bought at least once, but the last paid order is more than ${LAPSED_DAYS} days old.`,
  },
];

export const inSegment = (row: CustomerRow, segment: SegmentId, highSpenderThreshold: number, now = Date.now()) => {
  if (row.anonymised_at && segment !== "all") return false;
  if (segment === "high_spenders") return row.purchases_count > 0 && Number(row.total_spent) >= highSpenderThreshold;
  if (segment === "lapsed") {
    return !!row.last_purchase_at && now - new Date(row.last_purchase_at).getTime() > LAPSED_DAYS * 86_400_000;
  }
  return true;
};

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const fetchCustomers = async (): Promise<CustomerRow[]> => {
  const [customers, stats] = await Promise.all([
    db.from("customers").select("*").order("created_at", { ascending: false }),
    db.from("customer_stats").select("*"),
  ]);
  const byId = new Map(unwrap<CustomerStats[]>(stats).map((s) => [s.customer_id, s]));
  return unwrap<Customer[]>(customers).map((customer) => {
    const stat = byId.get(customer.id);
    return {
      ...customer,
      orders_count: Number(stat?.orders_count ?? 0),
      purchases_count: Number(stat?.purchases_count ?? 0),
      total_spent: Number(stat?.total_spent ?? 0),
      last_purchase_at: stat?.last_purchase_at ?? null,
      open_tickets: Number(stat?.open_tickets ?? 0),
    };
  });
};

export const fetchCustomer = async (id: string): Promise<Customer> =>
  unwrap(await db.from("customers").select("*").eq("id", id).single());

/** Orders and tickets of one customer, matched by email. */
export const fetchCustomerActivity = async (email: string) => {
  const [orders, tickets] = await Promise.all([
    db
      .from("sales_orders")
      .select("id, order_number, status, payment_status, total, created_at, customer_email")
      .ilike("customer_email", email)
      .order("created_at", { ascending: false }),
    db
      .from("warranty_tickets")
      .select("id, ticket_number, status, subject, created_at, customer_email")
      .ilike("customer_email", email)
      .order("created_at", { ascending: false }),
  ]);
  // ilike treats "_" and "%" in an address as wildcards, so keep exact matches only.
  const exact = <T extends { customer_email: string }>(rows: T[]) =>
    rows.filter((row) => row.customer_email.toLowerCase() === email.toLowerCase());
  return {
    orders: exact(
      unwrap<
        {
          id: string;
          order_number: string;
          status: string;
          payment_status: string;
          total: number;
          created_at: string;
          customer_email: string;
        }[]
      >(orders),
    ),
    tickets: exact(
      unwrap<
        { id: string; ticket_number: string; status: string; subject: string; created_at: string; customer_email: string }[]
      >(tickets),
    ),
  };
};

export const anonymiseCustomer = (id: string) => run(db.rpc("anonymise_customer", { p_customer_id: id }));

/** Splits a comma-separated tag field into clean, unique, lowercase tags. */
export const parseTags = (value: string) =>
  Array.from(new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))).slice(0, 20);

const csvCell = (value: string | number) => {
  const text = String(value);
  // Prefix formula characters so spreadsheets do not run customer-supplied text.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const customersToCsv = (rows: CustomerRow[]) => {
  const header = ["Email", "Name", "Phone", "Marketing consent", "Orders", "Total spent (EUR)", "Last purchase", "Tags"];
  const lines = rows.map((row) =>
    [
      row.email,
      row.full_name,
      row.phone,
      row.marketing_consent ? "yes" : "no",
      row.purchases_count,
      Number(row.total_spent).toFixed(2),
      row.last_purchase_at ? row.last_purchase_at.slice(0, 10) : "",
      row.tags.join(" "),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\n");
};

export const downloadFile = (filename: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
