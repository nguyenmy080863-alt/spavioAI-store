import { db } from "@/lib/orders";
import { csvCell } from "@/lib/customers";

export interface SalesPoint {
  period: string;
  orders: number;
  gross: number;
  discounts: number;
  returns: number;
  net: number;
}

export interface AnalyticsReport {
  period: { from: string; to: string; granularity: "day" | "week" | "month" };
  summary: {
    orders: number;
    gross_sales: number;
    discounts: number;
    returns_value: number;
    returns_completed: number;
    net_sales: number;
    average_order_value: number;
    revenue_collected: number;
  };
  sales_over_time: SalesPoint[];
  products: {
    top: { name: string; category: string; units: number; revenue: number }[];
    unsold_count: number;
    unsold: string[];
  };
  categories: { category: string; units: number; revenue: number }[];
  customers: {
    customers: number;
    new_customers: number;
    returning_customers: number;
    repeat_rate: number;
    new_orders: number;
    returning_orders: number;
    new_revenue: number;
    returning_revenue: number;
    account_orders: number;
    guest_orders: number;
    account_revenue: number;
    guest_revenue: number;
  };
  discounts: {
    by_discount: { name: string; code: string | null; type: string; uses: number; amount_given: number; revenue: number }[];
    orders_with_discount: number;
    share_of_orders: number;
  };
  returns: {
    requested: number;
    exchanges: number;
    completed: number;
    avg_days_to_refund: number;
    return_rate: number;
    reasons: { reason: string; count: number }[];
  };
  geography: {
    countries: { country: string; orders: number; revenue: number }[];
    cities: { city: string; country: string; orders: number; revenue: number }[];
  };
  payment_methods: { method: string; orders: number; revenue: number }[];
  warranty: {
    opened: number;
    resolved: number;
    avg_days_to_resolve: number;
    by_type: { type: string; count: number }[];
  };
}

export interface LiveMetrics {
  as_of: string;
  today: { orders: number; revenue: number; average_order_value: number; orders_placed: number };
  yesterday_same_time: { orders: number; revenue: number };
  yesterday: { orders: number; revenue: number };
  last_hour_orders_placed: number;
  hourly: { hour: number; orders: number; revenue: number }[];
  recent_orders: {
    id: string;
    order_number: string;
    customer: string;
    total: number;
    status: string;
    payment_status: string;
    source: string;
    created_at: string;
  }[];
  attention: {
    payments_to_confirm: number;
    new_tickets: number;
    open_tickets: number;
    returns_to_review: number;
    refunds_waiting: number;
    deliveries_to_hand_over: number;
    out_of_stock: number;
    low_stock: number;
  };
}

/** The KPIs a report can contain. The id is the section key in AnalyticsReport. */
export const KPI_SECTIONS = [
  { id: "summary", label: "Sales summary", hint: "Gross sales, discounts, returns, net sales, orders, average order value" },
  { id: "sales_over_time", label: "Sales over time", hint: "Orders and net sales per day, week or month" },
  { id: "products", label: "Products", hint: "Top products by revenue, products with no sales" },
  { id: "categories", label: "Sales by category", hint: "Units and revenue per category" },
  { id: "customers", label: "Customers", hint: "New vs returning, repeat rate, guest vs account" },
  { id: "discounts", label: "Discount performance", hint: "Uses, money given away and revenue per discount" },
  { id: "returns", label: "Returns", hint: "Return rate, reasons, refunds" },
  { id: "geography", label: "Sales by country and city", hint: "From the shipping address" },
  { id: "payment_methods", label: "Sales by payment method", hint: "PayPal, card, manual" },
  { id: "warranty", label: "Warranty tickets", hint: "Tickets opened, resolved, time to resolve" },
] as const;

export type KpiSectionId = (typeof KPI_SECTIONS)[number]["id"];
export type Granularity = "auto" | "day" | "week" | "month";

export const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** Day charts up to about three months, then weeks, then months. */
export const autoGranularity = (from: Date, to: Date): "day" | "week" | "month" => {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  return days <= 92 ? "day" : days <= 400 ? "week" : "month";
};

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const fetchAnalyticsReport = async (
  from: Date,
  to: Date,
  granularity: Granularity = "auto",
): Promise<AnalyticsReport> =>
  unwrap(
    await db.rpc("analytics_report", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_tz: browserTimeZone(),
      p_granularity: granularity === "auto" ? autoGranularity(from, to) : granularity,
    }),
  );

export const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

export const fetchLiveMetrics = async (): Promise<LiveMetrics> =>
  unwrap(await db.rpc("analytics_live", { p_day_start: startOfToday().toISOString(), p_tz: browserTimeZone() }));

/** Percentage change, or null when there is nothing to compare with. */
export const changePercent = (current: number, previous: number): number | null =>
  previous === 0 ? null : Math.round(((current - previous) / previous) * 100);

export const REASON_LABEL: Record<string, string> = {
  changed_mind: "Changed my mind (trial)",
  not_suitable: "Not suitable",
  defective: "Defective",
  wrong_item: "Wrong item",
  other: "Other",
};

export const TICKET_TYPE_NAME: Record<string, string> = { guidance: "Guidance", defect: "Defect", other: "Other" };

const money = (value: number) => Number(value).toFixed(2);

/** A section as rows (first row = headings), the shape used for CSV and the printable report. */
export const sectionTables = (report: AnalyticsReport, id: KpiSectionId): { title: string; rows: (string | number)[][] }[] => {
  switch (id) {
    case "summary": {
      const s = report.summary;
      return [
        {
          title: "Sales summary",
          rows: [
            ["Metric", "Value"],
            ["Paid orders", s.orders],
            ["Gross sales (EUR)", money(s.gross_sales)],
            ["Discounts (EUR)", money(s.discounts)],
            ["Returns (EUR)", money(s.returns_value)],
            ["Net sales (EUR)", money(s.net_sales)],
            ["Average order value (EUR)", money(s.average_order_value)],
            ["Collected from customers (EUR)", money(s.revenue_collected)],
          ],
        },
      ];
    }
    case "sales_over_time":
      return [
        {
          title: `Sales over time (per ${report.period.granularity})`,
          rows: [
            ["Period start", "Orders", "Gross (EUR)", "Discounts (EUR)", "Returns (EUR)", "Net sales (EUR)"],
            ...report.sales_over_time.map((p) => [p.period, p.orders, money(p.gross), money(p.discounts), money(p.returns), money(p.net)]),
          ],
        },
      ];
    case "products":
      return [
        {
          title: "Top products by revenue",
          rows: [["Product", "Category", "Units", "Revenue (EUR)"], ...report.products.top.map((p) => [p.name, p.category, p.units, money(p.revenue)])],
        },
        {
          title: `Published products with no sales (${report.products.unsold_count})`,
          rows: [["Product"], ...report.products.unsold.map((name) => [name])],
        },
      ];
    case "categories":
      return [
        {
          title: "Sales by category",
          rows: [["Category", "Units", "Revenue (EUR)"], ...report.categories.map((c) => [c.category, c.units, money(c.revenue)])],
        },
      ];
    case "customers": {
      const c = report.customers;
      return [
        {
          title: "Customers",
          rows: [
            ["Metric", "Value"],
            ["Customers who bought (with email)", c.customers],
            ["New customers (first purchase in period)", c.new_customers],
            ["Returning customers", c.returning_customers],
            ["Returning share of customers (%)", c.repeat_rate],
            ["Orders from new customers", c.new_orders],
            ["Orders from returning customers", c.returning_orders],
            ["Revenue from new customers (EUR)", money(c.new_revenue)],
            ["Revenue from returning customers (EUR)", money(c.returning_revenue)],
            ["Orders by signed-in customers", c.account_orders],
            ["Orders by guests", c.guest_orders],
            ["Revenue, signed-in customers (EUR)", money(c.account_revenue)],
            ["Revenue, guests (EUR)", money(c.guest_revenue)],
          ],
        },
      ];
    }
    case "discounts":
      return [
        {
          title: `Discount performance (${report.discounts.share_of_orders}% of orders used a discount)`,
          rows: [
            ["Discount", "Code", "Uses", "Given away (EUR)", "Order revenue (EUR)"],
            ...report.discounts.by_discount.map((d) => [d.name, d.code ?? "automatic", d.uses, money(d.amount_given), money(d.revenue)]),
          ],
        },
      ];
    case "returns": {
      const r = report.returns;
      return [
        {
          title: "Returns",
          rows: [
            ["Metric", "Value"],
            ["Return requests", r.requested],
            ["of which exchanges", r.exchanges],
            ["Completed (refunded)", r.completed],
            ["Return rate (% of paid orders)", r.return_rate],
            ["Average days from request to refund", r.avg_days_to_refund],
          ],
        },
        {
          title: "Return reasons",
          rows: [["Reason", "Requests"], ...r.reasons.map((x) => [REASON_LABEL[x.reason] ?? x.reason, x.count])],
        },
      ];
    }
    case "geography":
      return [
        {
          title: "Sales by country",
          rows: [["Country", "Orders", "Revenue (EUR)"], ...report.geography.countries.map((c) => [c.country, c.orders, money(c.revenue)])],
        },
        {
          title: "Top cities",
          rows: [["City", "Country", "Orders", "Revenue (EUR)"], ...report.geography.cities.map((c) => [c.city, c.country, c.orders, money(c.revenue)])],
        },
      ];
    case "payment_methods":
      return [
        {
          title: "Sales by payment method",
          rows: [["Method", "Orders", "Revenue (EUR)"], ...report.payment_methods.map((m) => [m.method, m.orders, money(m.revenue)])],
        },
      ];
    case "warranty": {
      const w = report.warranty;
      return [
        {
          title: "Warranty tickets",
          rows: [
            ["Metric", "Value"],
            ["Tickets opened", w.opened],
            ["Resolved or closed", w.resolved],
            ["Average days to resolve", w.avg_days_to_resolve],
            ...w.by_type.map((t) => [`Type: ${TICKET_TYPE_NAME[t.type] ?? t.type}`, t.count]),
          ],
        },
      ];
    }
  }
};

const day = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");

/** CSV with one block per selected KPI; blocks are separated by an empty line. */
export const reportToCsv = (report: AnalyticsReport, selected: KpiSectionId[]) => {
  const blocks: string[] = [
    [csvCell("Spavio AI Store report"), csvCell(`${day(report.period.from)} to ${day(report.period.to)}`)].join(","),
    "",
  ];
  for (const id of KPI_SECTIONS.map((s) => s.id).filter((s) => selected.includes(s))) {
    for (const table of sectionTables(report, id)) {
      blocks.push(csvCell(table.title));
      for (const row of table.rows) blocks.push(row.map((cell) => csvCell(cell)).join(","));
      blocks.push("");
    }
  }
  return `\uFEFF${blocks.join("\n")}`;
};

const escapeHtml = (value: string | number) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A standalone, print-friendly page. The browser's print dialog can save it as a PDF. */
export const reportToHtml = (report: AnalyticsReport, selected: KpiSectionId[]) => {
  const sections = KPI_SECTIONS.map((s) => s.id).filter((s) => selected.includes(s));
  const body = sections
    .flatMap((id) => sectionTables(report, id))
    .map((table) => {
      const [head, ...rows] = table.rows;
      return `<h2>${escapeHtml(table.title)}</h2>
<table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    })
    .join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Report ${day(report.period.from)} to ${day(report.period.to)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#1f1b2e;margin:32px;font-size:13px}
h1{font-size:22px;font-weight:normal;margin:0 0 4px} p.meta{color:#6b6780;margin:0 0 24px}
h2{font-size:15px;margin:28px 0 8px} table{border-collapse:collapse;width:100%;margin-bottom:8px}
th,td{border-bottom:1px solid #e6e2f0;padding:6px 8px;text-align:left} th{color:#6b6780;font-weight:normal;font-size:12px}
td:not(:first-child),th:not(:first-child){text-align:right} @media print{body{margin:12mm} h2{break-after:avoid} table{break-inside:avoid}}
</style></head><body>
<h1>Spavio AI Store report</h1>
<p class="meta">${day(report.period.from)} to ${day(report.period.to)} · amounts in EUR, VAT included · created ${new Date().toLocaleString()}</p>
${body}
</body></html>`;
};
