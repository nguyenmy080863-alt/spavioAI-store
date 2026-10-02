import { db } from "@/lib/orders";
import { csvCell } from "@/lib/customers";

export interface FinanceSummary {
  orders: number;
  gross_sales: number;
  discounts: number;
  returns_value: number;
  returns_count: number;
  net_sales: number;
  average_order_value: number;
  shipping_charged: number;
  collected: number;
  cash_refunded: number;
  return_deductions_kept: number;
  return_labels: { count: number; cost: number };
  cost_estimate: {
    units: number;
    units_with_cost: number;
    cogs: number;
    revenue_covered: number;
    margin: number | null;
    margin_percent: number | null;
  };
  to_check: {
    unconfirmed_payments: { count: number; amount: number };
    refunds_waiting: { count: number; amount: number };
    exchange_differences_owed: { count: number; amount: number };
    preorder_balances: { count: number; amount: number };
  };
  suppliers: { open_purchase_orders: number; open_cost: number };
}

export interface FinanceTransaction {
  date: string;
  type: "sale" | "refund" | "exchange_credit" | "return_label_cost";
  reference: string;
  order: string;
  customer: string;
  payment_method: string;
  payment_reference: string;
  items_gross: number;
  discount: number;
  shipping: number;
  order_total: number;
  cash_in: number;
  return_value: number;
  cash_out: number;
  label_cost: number;
  discount_code: string;
}

export type PeriodId = "this_month" | "last_month" | "last_30" | "this_year" | "custom";

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_30", label: "Last 30 days" },
  { id: "this_year", label: "This year" },
  { id: "custom", label: "Custom dates" },
];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

/** Inclusive start and end of a period, in the browser's local time. */
export const periodRange = (id: PeriodId, customFrom: string, customTo: string, now = new Date()) => {
  switch (id) {
    case "this_month":
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    case "last_month":
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "last_30":
      return { from: startOfDay(new Date(now.getTime() - 29 * 86_400_000)), to: endOfDay(now) };
    case "this_year":
      return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
    default:
      return {
        from: startOfDay(customFrom ? new Date(`${customFrom}T00:00:00`) : now),
        to: endOfDay(customTo ? new Date(`${customTo}T00:00:00`) : now),
      };
  }
};

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const fetchFinanceSummary = async (from: Date, to: Date): Promise<FinanceSummary> =>
  unwrap(await db.rpc("finance_summary", { p_from: from.toISOString(), p_to: to.toISOString() }));

export const fetchFinanceTransactions = async (from: Date, to: Date): Promise<FinanceTransaction[]> =>
  unwrap(await db.rpc("finance_transactions", { p_from: from.toISOString(), p_to: to.toISOString() }));

const TYPE_LABEL: Record<FinanceTransaction["type"], string> = {
  sale: "Sale",
  refund: "Refund",
  exchange_credit: "Exchange credit",
  return_label_cost: "Return label cost",
};

const money = (value: number) => Number(value).toFixed(2);

/**
 * CSV for the accountant. Amounts are in EUR with a dot as decimal separator; refunds and costs are
 * negative. Customer text is written so spreadsheets cannot run it as a formula.
 */
export const transactionsToCsv = (rows: FinanceTransaction[]) => {
  const header = [
    "Date",
    "Type",
    "Reference",
    "Order",
    "Customer",
    "Payment method",
    "Payment reference",
    "Items gross",
    "Discount",
    "Shipping",
    "Order total",
    "Cash received",
    "Return value",
    "Cash refunded",
    "Return label cost",
    "Discount code",
  ];
  const lines = rows.map((row) =>
    [
      row.date.slice(0, 19).replace("T", " "),
      TYPE_LABEL[row.type] ?? row.type,
      row.reference,
      row.order,
      row.customer,
      row.payment_method,
      row.payment_reference,
      money(row.items_gross),
      money(row.discount),
      money(row.shipping),
      money(row.order_total),
      money(row.cash_in),
      money(row.return_value),
      money(row.cash_out),
      money(row.label_cost),
      row.discount_code,
    ]
      .map(csvCell)
      .join(","),
  );
  // A BOM makes Excel open the file as UTF-8.
  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\n")}`;
};
