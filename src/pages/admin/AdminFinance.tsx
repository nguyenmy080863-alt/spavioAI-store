import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PERIODS,
  fetchFinanceSummary,
  fetchFinanceTransactions,
  periodRange,
  transactionsToCsv,
  type FinanceSummary,
  type PeriodId,
} from "@/lib/finance";
import { downloadFile } from "@/lib/customers";
import { logAudit } from "@/lib/audit";
import { formatPrice } from "@/data/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Card = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="border border-border p-4">
    <p className="text-xl font-light text-foreground">{value}</p>
    <p className="text-xs text-muted-foreground mt-1">{label}</p>
    {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
  </div>
);

const CheckRow = ({
  label,
  count,
  amount,
  to,
  hint,
}: {
  label: string;
  count: number;
  amount: number;
  to: string;
  hint: string;
}) => (
  <li className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
    <span>
      <span className="text-foreground">{label}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </span>
    <span className="flex items-center gap-4">
      <span className={count > 0 ? "text-amber-700" : "text-muted-foreground"}>
        {count} · {formatPrice(Number(amount))}
      </span>
      <Link to={to} className="text-xs text-accent">
        Open
      </Link>
    </span>
  </li>
);

const Overview = ({ data }: { data: FinanceSummary }) => {
  const cost = data.cost_estimate;
  const coverage = cost.units > 0 ? Math.round((cost.units_with_cost / cost.units) * 100) : 0;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Sales in this period</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Net sales" value={formatPrice(data.net_sales)} hint="Gross − discounts − returns" />
          <Card label="Gross sales" value={formatPrice(data.gross_sales)} hint="List prices of paid orders" />
          <Card label="Discounts" value={`−${formatPrice(data.discounts)}`} />
          <Card
            label={`Returns (${data.returns_count})`}
            value={`−${formatPrice(data.returns_value)}`}
            hint="Value of returns refunded"
          />
          <Card label="Paid orders" value={String(data.orders)} />
          <Card label="Average order value" value={formatPrice(data.average_order_value)} hint="Items after discounts" />
          <Card label="Shipping charged" value={formatPrice(data.shipping_charged)} hint="Not part of net sales" />
          <Card label="Collected from customers" value={formatPrice(data.collected)} hint="Items or deposits, plus shipping" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Money out</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Cash refunded" value={formatPrice(data.cash_refunded)} hint="Paid back to customers" />
          <Card
            label="Return labels we paid"
            value={formatPrice(data.return_labels.cost)}
            hint={`${data.return_labels.count} label(s), Sendcloud price list`}
          />
          <Card
            label="Label costs kept from refunds"
            value={formatPrice(data.return_deductions_kept)}
            hint="Deductions taken from refunds"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Money to check (right now)</h2>
        <ul className="border border-border divide-y divide-border">
          <CheckRow
            label="Payments to confirm"
            {...data.to_check.unconfirmed_payments}
            to="/admin/orders"
            hint="Customer finished PayPal but the order is not marked paid. Check PayPal, then mark paid."
          />
          <CheckRow
            label="Refunds waiting"
            {...data.to_check.refunds_waiting}
            to="/admin/returns"
            hint="Parcels received and not refunded yet."
          />
          <CheckRow
            label="Exchange differences owed by customers"
            {...data.to_check.exchange_differences_owed}
            to="/admin/orders"
            hint="Replacement orders that wait for the customer to pay the difference."
          />
          <CheckRow
            label="Preorder balances to collect"
            {...data.to_check.preorder_balances}
            to="/admin/orders"
            hint="Paid deposits; the balance is charged when the items ship."
          />
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Suppliers</h2>
        <ul className="border border-border divide-y divide-border">
          <CheckRow
            label="Open purchase orders"
            count={data.suppliers.open_purchase_orders}
            amount={data.suppliers.open_cost}
            to="/admin/products/purchase-orders"
            hint="Cost of goods ordered and not received yet."
          />
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Rough margin (estimate)</h2>
        {cost.margin === null ? (
          <p className="text-sm text-muted-foreground">
            No supplier costs found for the items sold in this period. Enter unit costs on your purchase orders to see a
            margin.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card
              label="Estimated margin"
              value={`${cost.margin_percent}%`}
              hint={`${formatPrice(cost.margin)} on items with a known cost`}
            />
            <Card label="Estimated cost of goods" value={formatPrice(cost.cogs)} hint="Average supplier cost per product" />
            <Card
              label="Cost coverage"
              value={`${coverage}%`}
              hint={`${cost.units_with_cost} of ${cost.units} items sold have a purchase order cost`}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          An estimate: it uses the average unit cost from purchase orders (ordered or received), ignores returns, and
          leaves out products without a cost. It does not include shipping, label costs, PayPal fees or advertising.
        </p>
      </section>
    </div>
  );
};

const AdminFinance = () => {
  const [period, setPeriod] = useState<PeriodId>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = periodRange(period, customFrom, customTo);
  const invalid = range.to < range.from;

  const { data, isLoading, error } = useQuery({
    queryKey: ["finance-summary", range.from.toISOString(), range.to.toISOString()],
    queryFn: () => fetchFinanceSummary(range.from, range.to),
    enabled: !invalid,
    retry: false,
  });

  const exportCsv = useMutation({
    mutationFn: async () => {
      const rows = await fetchFinanceTransactions(range.from, range.to);
      const day = (date: Date) => date.toLocaleDateString("sv-SE");
      downloadFile(`transactions-${day(range.from)}-to-${day(range.to)}.csv`, transactionsToCsv(rows), "text/csv;charset=utf-8");
      await logAudit("export", "finance", null, { rows: rows.length, from: range.from.toISOString(), to: range.to.toISOString() });
      return rows.length;
    },
    onSuccess: (count) => toast.success(`Exported ${count} transaction(s)`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Finance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sales, refunds, costs and the money you still need to check. All amounts include VAT; VAT is not calculated
            here.
          </p>
        </div>
        <Button size="sm" disabled={invalid || exportCsv.isPending} onClick={() => exportCsv.mutate()}>
          {exportCsv.isPending ? "Preparing…" : "Export transactions (CSV)"}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Period</Label>
          <Select value={period} onValueChange={(value) => setPeriod(value as PeriodId)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {period === "custom" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="f-from">From</Label>
              <Input id="f-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-to">To</Label>
              <Input id="f-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground pb-2">
          {range.from.toLocaleDateString()} – {range.to.toLocaleDateString()} (your local time)
        </p>
      </div>
      {invalid && <p className="text-sm text-destructive">The end date must not be before the start date.</p>}

      {error && (
        <p className="text-sm text-destructive">
          {error.message}. Has migration 0019 been applied in Supabase?
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && <Overview data={data} />}

      <div className="border border-border p-4 text-xs text-muted-foreground space-y-1">
        <p className="text-foreground text-sm">About the CSV</p>
        <p>
          One row per sale, per refund (negative), and per return label cost (negative) in the period. Sales are dated
          by the day they were marked paid; refunds by the day they were refunded. Share it with your accountant;
          customer emails are not included.
        </p>
      </div>
    </div>
  );
};

export default AdminFinance;
