import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIODS, type PeriodId } from "@/lib/finance";

interface PeriodPickerProps {
  period: PeriodId;
  onPeriod: (value: PeriodId) => void;
  customFrom: string;
  onCustomFrom: (value: string) => void;
  customTo: string;
  onCustomTo: (value: string) => void;
  range: { from: Date; to: Date };
}

/** Period dropdown with custom dates; used by Analytics and Reports. */
const PeriodPicker = ({ period, onPeriod, customFrom, onCustomFrom, customTo, onCustomTo, range }: PeriodPickerProps) => (
  <div className="flex flex-wrap items-end gap-3">
    <div className="space-y-1.5">
      <Label>Period</Label>
      <Select value={period} onValueChange={(value) => onPeriod(value as PeriodId)}>
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
          <Label htmlFor="p-from">From</Label>
          <Input id="p-from" type="date" value={customFrom} onChange={(e) => onCustomFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-to">To</Label>
          <Input id="p-to" type="date" value={customTo} onChange={(e) => onCustomTo(e.target.value)} />
        </div>
      </>
    )}
    <p className="text-xs text-muted-foreground pb-2">
      {range.from.toLocaleDateString()} – {range.to.toLocaleDateString()} (your local time)
    </p>
  </div>
);

export default PeriodPicker;
