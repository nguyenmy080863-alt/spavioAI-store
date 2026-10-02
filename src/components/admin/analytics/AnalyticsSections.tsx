import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  REASON_LABEL,
  TICKET_TYPE_NAME,
  changePercent,
  type AnalyticsReport,
  type KpiSectionId,
} from "@/lib/analytics";
import { formatPrice } from "@/data/products";

export const Card = ({
  label,
  value,
  hint,
  change,
}: {
  label: string;
  value: string;
  hint?: string;
  change?: number | null;
}) => (
  <div className="border border-border p-4">
    <p className="text-xl font-light text-foreground">{value}</p>
    <p className="text-xs text-muted-foreground mt-1">{label}</p>
    {change !== undefined && (
      <p className={`text-[11px] mt-1 ${change === null ? "text-muted-foreground" : change < 0 ? "text-destructive" : "text-emerald-700"}`}>
        {change === null ? "no earlier data" : `${change > 0 ? "+" : ""}${change}% vs previous period`}
      </p>
    )}
    {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
  </div>
);

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-sm font-medium text-foreground">{title}</h2>
    {children}
  </section>
);

const Table = ({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) => (
  <div className="border border-border overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
          {head.map((h, index) => (
            <th key={h} className={`p-3 ${index > 0 ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={head.length} className="p-4 text-center text-muted-foreground">
              {empty}
            </td>
          </tr>
        )}
        {rows.map((row, index) => (
          <tr key={index} className="border-b border-border last:border-0">
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className={`p-3 ${cellIndex > 0 ? "text-right text-muted-foreground" : "text-foreground"}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** Horizontal bars for a share-of-total comparison. */
const Bars = ({ items }: { items: { label: string; value: number; note: string }[] }) => {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="text-sm">
          <div className="flex justify-between">
            <span className="text-foreground">{item.label}</span>
            <span className="text-muted-foreground">{item.note}</span>
          </div>
          <div className="h-1.5 bg-muted mt-1">
            <div className="h-1.5 bg-primary" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
      {items.length === 0 && <li className="text-sm text-muted-foreground">No data in this period.</li>}
    </ul>
  );
};

const shortDate = (period: string, granularity: string) => {
  const date = new Date(`${period}T12:00:00`);
  return granularity === "month"
    ? date.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export const SalesChart = ({ report }: { report: AnalyticsReport }) => {
  const data = report.sales_over_time.map((point) => ({
    ...point,
    label: shortDate(point.period, report.period.granularity),
  }));
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No data in this period.</p>;
  return (
    <div className="h-64 border border-border p-3">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} minTickGap={16} />
          <YAxis yAxisId="money" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
          <YAxis yAxisId="orders" orientation="right" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
          <Tooltip
            formatter={(value: number, name: string) => (name === "Orders" ? [value, name] : [formatPrice(Number(value)), name])}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar yAxisId="money" dataKey="net" name="Net sales" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
          <Line yAxisId="orders" dataKey="orders" name="Orders" stroke="hsl(var(--foreground))" strokeWidth={1.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

interface AnalyticsSectionsProps {
  report: AnalyticsReport;
  /** Which KPIs to show; defaults to all. */
  sections?: KpiSectionId[];
  /** Report of the period before, to show changes on the summary cards. */
  previous?: AnalyticsReport;
}

const ALL: KpiSectionId[] = [
  "summary",
  "sales_over_time",
  "products",
  "categories",
  "customers",
  "discounts",
  "returns",
  "geography",
  "payment_methods",
  "warranty",
];

const AnalyticsSections = ({ report, sections = ALL, previous }: AnalyticsSectionsProps) => {
  const has = (id: KpiSectionId) => sections.includes(id);
  const s = report.summary;
  const p = previous?.summary;
  const c = report.customers;
  const customerTotal = Math.max(c.new_customers + c.returning_customers, 1);

  return (
    <div className="space-y-10">
      {has("summary") && (
        <Block title="Sales summary">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Net sales" value={formatPrice(s.net_sales)} change={p ? changePercent(s.net_sales, p.net_sales) : undefined} hint="Gross − discounts − returns" />
            <Card label="Paid orders" value={String(s.orders)} change={p ? changePercent(s.orders, p.orders) : undefined} />
            <Card label="Average order value" value={formatPrice(s.average_order_value)} change={p ? changePercent(s.average_order_value, p.average_order_value) : undefined} hint="Items after discounts" />
            <Card label="Gross sales" value={formatPrice(s.gross_sales)} change={p ? changePercent(s.gross_sales, p.gross_sales) : undefined} />
            <Card label="Discounts" value={`−${formatPrice(s.discounts)}`} />
            <Card label={`Returns (${s.returns_completed})`} value={`−${formatPrice(s.returns_value)}`} />
          </div>
        </Block>
      )}

      {has("sales_over_time") && (
        <Block title={`Net sales and orders per ${report.period.granularity}`}>
          <SalesChart report={report} />
        </Block>
      )}

      {has("products") && (
        <Block title="Products">
          <Table
            head={["Top products by revenue", "Category", "Units", "Revenue"]}
            rows={report.products.top.map((x) => [x.name, x.category, x.units, formatPrice(x.revenue)])}
            empty="No sales in this period."
          />
          <p className="text-xs text-muted-foreground">
            {report.products.unsold_count} published product(s) had no sales
            {report.products.unsold.length > 0 && `: ${report.products.unsold.join(", ")}`}
            {report.products.unsold_count > report.products.unsold.length && " …"}
          </p>
        </Block>
      )}

      {has("categories") && (
        <Block title="Sales by category">
          <Bars
            items={report.categories.map((x) => ({
              label: x.category,
              value: x.revenue,
              note: `${formatPrice(x.revenue)} · ${x.units} unit(s)`,
            }))}
          />
        </Block>
      )}

      {has("customers") && (
        <Block title="Customers">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Customers who bought" value={String(c.customers)} hint="Matched by email" />
            <Card label="New customers" value={String(c.new_customers)} hint="First purchase in this period" />
            <Card label="Returning customers" value={String(c.returning_customers)} hint={`${c.repeat_rate}% of customers`} />
            <Card label="Revenue: new / returning" value={`${formatPrice(c.new_revenue)} / ${formatPrice(c.returning_revenue)}`} />
          </div>
          <div className="flex h-2 overflow-hidden bg-muted">
            <div className="bg-primary" style={{ width: `${(c.new_customers / customerTotal) * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Purple: new customers. Grey: returning customers.</p>
          <Table
            head={["Customer type", "Orders", "Revenue"]}
            rows={[
              ["Signed-in customers", c.account_orders, formatPrice(c.account_revenue)],
              ["Guests", c.guest_orders, formatPrice(c.guest_revenue)],
            ]}
            empty=""
          />
        </Block>
      )}

      {has("discounts") && (
        <Block title={`Discount performance (${report.discounts.share_of_orders}% of orders used a discount)`}>
          <Table
            head={["Discount", "Code", "Uses", "Given away", "Order revenue"]}
            rows={report.discounts.by_discount.map((d) => [d.name, d.code ?? "automatic", d.uses, formatPrice(d.amount_given), formatPrice(d.revenue)])}
            empty="No discounts used in this period."
          />
        </Block>
      )}

      {has("returns") && (
        <Block title="Returns">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Return requests" value={String(report.returns.requested)} hint={`${report.returns.exchanges} exchange(s)`} />
            <Card label="Return rate" value={`${report.returns.return_rate}%`} hint="Requests per paid order" />
            <Card label="Completed" value={String(report.returns.completed)} />
            <Card label="Days to refund" value={String(report.returns.avg_days_to_refund)} hint="Average, request to refund" />
          </div>
          <Bars
            items={report.returns.reasons.map((x) => ({
              label: REASON_LABEL[x.reason] ?? x.reason,
              value: x.count,
              note: String(x.count),
            }))}
          />
        </Block>
      )}

      {has("geography") && (
        <Block title="Sales by country and city">
          <div className="grid gap-4 md:grid-cols-2">
            <Table
              head={["Country", "Orders", "Revenue"]}
              rows={report.geography.countries.map((x) => [x.country, x.orders, formatPrice(x.revenue)])}
              empty="No sales in this period."
            />
            <Table
              head={["City", "Orders", "Revenue"]}
              rows={report.geography.cities.map((x) => [`${x.city} (${x.country})`, x.orders, formatPrice(x.revenue)])}
              empty="No sales in this period."
            />
          </div>
        </Block>
      )}

      {has("payment_methods") && (
        <Block title="Sales by payment method">
          <Table
            head={["Method", "Orders", "Revenue"]}
            rows={report.payment_methods.map((x) => [x.method, x.orders, formatPrice(x.revenue)])}
            empty="No sales in this period."
          />
        </Block>
      )}

      {has("warranty") && (
        <Block title="Warranty tickets">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Tickets opened" value={String(report.warranty.opened)} />
            <Card label="Resolved or closed" value={String(report.warranty.resolved)} />
            <Card label="Days to resolve" value={String(report.warranty.avg_days_to_resolve)} hint="Average" />
          </div>
          <Bars
            items={report.warranty.by_type.map((x) => ({
              label: TICKET_TYPE_NAME[x.type] ?? x.type,
              value: x.count,
              note: String(x.count),
            }))}
          />
        </Block>
      )}
    </div>
  );
};

export default AnalyticsSections;
