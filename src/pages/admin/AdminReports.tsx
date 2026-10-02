import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  KPI_SECTIONS,
  fetchAnalyticsReport,
  reportToCsv,
  reportToHtml,
  type Granularity,
  type KpiSectionId,
} from "@/lib/analytics";
import { periodRange, type PeriodId } from "@/lib/finance";
import { downloadFile } from "@/lib/customers";
import { logAudit } from "@/lib/audit";
import AnalyticsSections from "@/components/admin/analytics/AnalyticsSections";
import PeriodPicker from "@/components/admin/PeriodPicker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AdminReports = () => {
  const [selected, setSelected] = useState<KpiSectionId[]>(KPI_SECTIONS.map((s) => s.id));
  const [period, setPeriod] = useState<PeriodId>("last_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("auto");

  const range = periodRange(period, customFrom, customTo);
  const invalid = range.to < range.from;

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics-report", range.from.toISOString(), range.to.toISOString(), granularity],
    queryFn: () => fetchAnalyticsReport(range.from, range.to, granularity),
    enabled: !invalid,
    retry: false,
  });

  const toggle = (id: KpiSectionId) =>
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  const name = (extension: string) =>
    `report-${range.from.toLocaleDateString("sv-SE")}-to-${range.to.toLocaleDateString("sv-SE")}.${extension}`;

  const exportCsv = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("The report is still loading");
      downloadFile(name("csv"), reportToCsv(data, selected), "text/csv;charset=utf-8");
      await logAudit("export", "analytics_report", null, { kpis: selected, from: data.period.from, to: data.period.to });
    },
    onSuccess: () => toast.success("Report exported"),
    onError: (e: Error) => toast.error(e.message),
  });

  const printReport = () => {
    if (!data) return;
    const page = window.open("", "_blank");
    if (!page) {
      toast.error("Your browser blocked the report window. Allow pop-ups and try again.");
      return;
    }
    page.document.write(reportToHtml(data, selected));
    page.document.close();
    page.focus();
    page.print();
    void logAudit("export", "analytics_report", null, { kpis: selected, format: "print", from: data.period.from, to: data.period.to });
  };

  const nothingSelected = selected.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-muted-foreground mb-1">
          <Link to="/admin/analytics">Analytics</Link>
        </p>
        <h1 className="text-xl font-light text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the KPIs and a time range, check the preview, then export it as a CSV file or print it (save as PDF).
          Amounts include VAT.
        </p>
      </div>

      <section className="border border-border p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">KPIs in the report</h2>
          <div className="flex gap-3 text-xs">
            <button type="button" className="text-accent" onClick={() => setSelected(KPI_SECTIONS.map((s) => s.id))}>
              Select all
            </button>
            <button type="button" className="text-muted-foreground" onClick={() => setSelected([])}>
              Clear
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
          {KPI_SECTIONS.map((section) => (
            <label key={section.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(section.id)}
                onChange={() => toggle(section.id)}
              />
              <span>
                {section.label}
                <span className="block text-xs text-muted-foreground">{section.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-end gap-4">
        <PeriodPicker
          period={period}
          onPeriod={setPeriod}
          customFrom={customFrom}
          onCustomFrom={setCustomFrom}
          customTo={customTo}
          onCustomTo={setCustomTo}
          range={range}
        />
        {selected.includes("sales_over_time") && (
          <div className="space-y-1.5">
            <Label>Sales over time per</Label>
            <Select value={granularity} onValueChange={(value) => setGranularity(value as Granularity)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatic</SelectItem>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {invalid && <p className="text-sm text-destructive">The end date must not be before the start date.</p>}

      <div className="flex flex-wrap gap-3">
        <Button size="sm" disabled={!data || nothingSelected || exportCsv.isPending} onClick={() => exportCsv.mutate()}>
          Export CSV
        </Button>
        <Button size="sm" variant="outline" disabled={!data || nothingSelected} onClick={printReport}>
          Print / save as PDF
        </Button>
        {nothingSelected && <p className="text-xs text-muted-foreground self-center">Choose at least one KPI.</p>}
      </div>

      {error && <p className="text-sm text-destructive">{error.message}. Has migration 0020 been applied in Supabase?</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && !nothingSelected && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-foreground border-b border-border pb-2">Preview</h2>
          <AnalyticsSections report={data} sections={selected} />
        </div>
      )}
    </div>
  );
};

export default AdminReports;
