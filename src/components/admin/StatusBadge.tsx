import { STATUS_LABEL } from "@/lib/orders";

const STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-blue-500/10 text-blue-700",
  ordered: "bg-blue-500/10 text-blue-700",
  preparing: "bg-amber-500/10 text-amber-700",
  unpaid: "bg-amber-500/10 text-amber-700",
  partially_received: "bg-amber-500/10 text-amber-700",
  on_delivery: "bg-violet-500/10 text-violet-700",
  received: "bg-emerald-500/10 text-emerald-700",
  paid: "bg-emerald-500/10 text-emerald-700",
  completed: "bg-emerald-500/10 text-emerald-700",
  delivered: "bg-emerald-500/10 text-emerald-700",
  in_review: "bg-violet-500/10 text-violet-700",
  awaiting_customer: "bg-amber-500/10 text-amber-700",
  visit_scheduled: "bg-blue-500/10 text-blue-700",
  resolved: "bg-emerald-500/10 text-emerald-700",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  refunded: "bg-destructive/10 text-destructive",
};

const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${STYLE[status] ?? "bg-muted text-muted-foreground"}`}
  >
    {STATUS_LABEL[status] ?? status}
  </span>
);

export default StatusBadge;
