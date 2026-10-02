import type { WarrantyState } from "@/lib/warranty";

const CONFIG: Record<WarrantyState, { label: string; style: string }> = {
  verified_active: { label: "In warranty", style: "bg-emerald-500/10 text-emerald-700" },
  verified_expired: { label: "Expired", style: "bg-destructive/10 text-destructive" },
  not_started: { label: "Not delivered yet", style: "bg-amber-500/10 text-amber-700" },
  unverified: { label: "Purchase unverified", style: "bg-amber-500/10 text-amber-700" },
};

const WarrantyStateBadge = ({ state }: { state: WarrantyState }) => (
  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${CONFIG[state].style}`}>
    {CONFIG[state].label}
  </span>
);

export default WarrantyStateBadge;
