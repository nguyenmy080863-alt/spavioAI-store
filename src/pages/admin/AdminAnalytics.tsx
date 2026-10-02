import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAnalyticsReport } from "@/lib/analytics";
import { periodRange, type PeriodId } from "@/lib/finance";
import AnalyticsSections from "@/components/admin/analytics/AnalyticsSections";
import PeriodPicker from "@/components/admin/PeriodPicker";
import { Button } from "@/components/ui/button";

const AdminAnalytics = () => {
  const [period, setPeriod] = useState<PeriodId>("last_30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = periodRange(period, customFrom, customTo);
  const invalid = range.to < range.from;
  // The period right before, same length, for the change figures.
  const previousTo = new Date(range.from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - (range.to.getTime() - range.from.getTime()));

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics-report", range.from.toISOString(), range.to.toISOString()],
    queryFn: () => fetchAnalyticsReport(range.from, range.to),
    enabled: !invalid,
    retry: false,
  });
  const { data: previous } = useQuery({
    queryKey: ["analytics-report", previousFrom.toISOString(), previousTo.toISOString()],
    queryFn: () => fetchAnalyticsReport(previousFrom, previousTo),
    enabled: !invalid && !!data,
    retry: false,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            How the store is doing over time. Amounts include VAT. Want to export these numbers? Use{" "}
            <Link to="/admin/analytics/reports" className="text-accent">
              Reports
            </Link>
            , or watch today in{" "}
            <Link to="/admin/analytics/live-view" className="text-accent">
              Live view
            </Link>
            .
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/analytics/reports">Create a report</Link>
        </Button>
      </div>

      <PeriodPicker
        period={period}
        onPeriod={setPeriod}
        customFrom={customFrom}
        onCustomFrom={setCustomFrom}
        customTo={customTo}
        onCustomTo={setCustomTo}
        range={range}
      />
      {invalid && <p className="text-sm text-destructive">The end date must not be before the start date.</p>}
      {error && <p className="text-sm text-destructive">{error.message}. Has migration 0020 been applied in Supabase?</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && <AnalyticsSections report={data} previous={previous} />}

      <p className="text-xs text-muted-foreground">
        Not tracked yet: visitors, sessions, conversion rate, traffic sources and cart activity. They need visitor
        tracking, which the store does not have.
      </p>
    </div>
  );
};

export default AdminAnalytics;
