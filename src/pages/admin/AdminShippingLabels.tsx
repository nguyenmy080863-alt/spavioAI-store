import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, formatDate } from "@/lib/orders";
import {
  EU_COUNTRIES,
  DEFAULT_WEIGHT_SETTINGS,
  buyShippingLabel,
  cancelShippingLabel,
  downloadLabelFile,
  estimateWeight,
  fetchShippingMethods,
  fetchWeightSettings,
  isNotConnected,
  recipientFromOrder,
  saveWeightSettings,
} from "@/lib/shipping";
import { logAudit } from "@/lib/audit";
import { formatPrice } from "@/data/products";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MAX_BATCH = 50;

interface Row {
  id: string;
  delivery_number: string;
  carrier: string | null;
  tracking_number: string | null;
  label_service: string;
  label_cost: number;
  label_created_at: string | null;
  label_cancelled_at: string | null;
  label_a6_path: string;
  label_a4_path: string;
  created_at: string;
  sales_orders: {
    id: string;
    order_number: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    shipping_address: { address?: string; city?: string; postal_code?: string; country?: string };
  } | null;
  delivery_order_items: {
    quantity: number;
    sales_order_items: { products: { name: string; weight_grams: number | null } | null } | null;
  }[];
}

const fetchRows = async (): Promise<Row[]> => {
  const select =
    "id, delivery_number, carrier, tracking_number, label_service, label_cost, label_created_at, label_cancelled_at, label_a6_path, label_a4_path, created_at, " +
    "sales_orders(id, order_number, customer_name, customer_email, customer_phone, shipping_address), " +
    "delivery_order_items(quantity, sales_order_items(products(name, weight_grams)))";
  const { data, error } = await db.from("delivery_orders").select(select).eq("status", "preparing").order("created_at", { ascending: true });
  if (!error) return data as unknown as Row[];
  // The weight column does not exist before migration 0022: ask again without it.
  const fallback = await db
    .from("delivery_orders")
    .select("id, delivery_number, carrier, tracking_number, created_at, sales_orders(id, order_number, customer_name, customer_email, customer_phone, shipping_address), delivery_order_items(quantity, sales_order_items(products(name)))")
    .eq("status", "preparing")
    .order("created_at", { ascending: true });
  if (fallback.error) throw new Error(error.message);
  return (fallback.data as unknown as Row[]).map((row) => ({
    ...row,
    label_service: "",
    label_cost: 0,
    label_created_at: null,
    label_cancelled_at: null,
    label_a6_path: "",
    label_a4_path: "",
  }));
};

const WeightSettingsBox = () => {
  const queryClient = useQueryClient();
  const { roles } = useAdminAuth();
  const canEdit = roles.includes("super_admin");
  const { data } = useQuery({ queryKey: ["weight-settings"], queryFn: fetchWeightSettings });
  const [fallbackGrams, setFallbackGrams] = useState<string>();
  const [packagingGrams, setPackagingGrams] = useState<string>();

  const save = useMutation({
    mutationFn: async () => {
      const settings = {
        defaultPackageGrams: Math.round(Number(fallbackGrams ?? data?.defaultPackageGrams)),
        packagingGrams: Math.round(Number(packagingGrams ?? data?.packagingGrams)),
      };
      if (!(settings.defaultPackageGrams >= 10 && settings.defaultPackageGrams <= 30000)) throw new Error("Default weight: 10 to 30000 grams");
      if (!(settings.packagingGrams >= 0 && settings.packagingGrams <= 5000)) throw new Error("Packaging weight: 0 to 5000 grams");
      await saveWeightSettings(settings);
      await logAudit("setting", "store_settings", "package_weights", settings);
    },
    onSuccess: () => {
      toast.success("Weights saved");
      void queryClient.invalidateQueries({ queryKey: ["weight-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = data ?? DEFAULT_WEIGHT_SETTINGS;
  return (
    <div className="border border-border p-4 max-w-xl space-y-3">
      <p className="text-sm text-foreground">Parcel weights</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="w-pack" className="text-xs">Packaging added to product weights (g)</Label>
          <Input id="w-pack" type="number" min={0} disabled={!canEdit} value={packagingGrams ?? current.packagingGrams} onChange={(e) => setPackagingGrams(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="w-default" className="text-xs">Default parcel weight when no product has a weight (g)</Label>
          <Input id="w-default" type="number" min={10} disabled={!canEdit} value={fallbackGrams ?? current.defaultPackageGrams} onChange={(e) => setFallbackGrams(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Product weights are set on each product. {canEdit ? "" : "Only a Super Admin can change these."}
      </p>
      {canEdit && (
        <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
          Save weights
        </Button>
      )}
    </div>
  );
};

const AdminShippingLabels = () => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [methodId, setMethodId] = useState("");
  const [results, setResults] = useState<{ id: string; ok: boolean; text: string }[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ["label-deliveries"], queryFn: fetchRows });
  const { data: settings = DEFAULT_WEIGHT_SETTINGS } = useQuery({ queryKey: ["weight-settings"], queryFn: fetchWeightSettings });

  const prepared = useMemo(
    () =>
      rows.map((row) => {
        const order = row.sales_orders;
        const { recipient, problems } = order
          ? recipientFromOrder(order)
          : { recipient: null, problems: ["Order missing"] };
        const weight = estimateWeight(
          row.delivery_order_items.map((di) => ({ quantity: di.quantity, weight_grams: di.sales_order_items?.products?.weight_grams ?? null })),
          settings,
        );
        const labelled = !!row.label_created_at && !row.label_cancelled_at;
        return { row, recipient, problems, weight, labelled };
      }),
    [rows, settings],
  );

  const todo = prepared.filter((p) => !p.labelled);
  const done = prepared.filter((p) => p.labelled);

  const chosen = todo.filter((p) => selected.includes(p.row.id));
  const countries = Array.from(new Set(chosen.map((p) => p.recipient?.country ?? "")));
  const sameCountry = countries.length === 1 && !!EU_COUNTRIES[countries[0]];
  const heaviest = Math.max(0, ...chosen.map((p) => p.weight));
  const lightest = Math.min(...chosen.map((p) => p.weight), Infinity);

  const { data: methods = [], error: methodsError, isFetching } = useQuery({
    queryKey: ["shipping-methods", countries[0], heaviest],
    queryFn: () => fetchShippingMethods(countries[0], heaviest),
    enabled: chosen.length > 0 && sameCountry && heaviest >= 10 && heaviest <= 30000,
    retry: false,
  });
  const effectiveMethod = methods.some((m) => String(m.id) === methodId) ? methodId : methods[0] ? String(methods[0].id) : "";

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["label-deliveries"] });
    void queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
  };

  const buyAll = useMutation({
    mutationFn: async () => {
      setResults([]);
      const out: { id: string; ok: boolean; text: string }[] = [];
      let index = 0;
      for (const item of chosen) {
        index += 1;
        setProgress(`Buying label ${index} of ${chosen.length}…`);
        try {
          const result = await buyShippingLabel(item.row.id, Number(effectiveMethod), item.weight, item.recipient!);
          out.push({ id: item.row.id, ok: true, text: `${item.row.delivery_number}: ${result.tracking_number ?? "bought"}` });
        } catch (e) {
          out.push({ id: item.row.id, ok: false, text: `${item.row.delivery_number}: ${(e as Error).message}` });
        }
        setResults([...out]);
      }
      setProgress(null);
      await logAudit("buy_labels_bulk", "delivery_order", null, { count: out.filter((r) => r.ok).length, failed: out.filter((r) => !r.ok).length });
      return out;
    },
    onSuccess: (out) => {
      const ok = out.filter((r) => r.ok).length;
      if (ok > 0) toast.success(`${ok} label(s) bought`);
      if (ok < out.length) toast.error(`${out.length - ok} label(s) failed. See the list below.`);
      setSelected([]);
      refresh();
    },
    onError: (e: Error) => {
      setProgress(null);
      toast.error(e.message);
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      await cancelShippingLabel(id);
      await logAudit("cancel_label", "delivery_order", id, {});
    },
    onSuccess: () => {
      toast.success("Label cancelled");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const download = (path: string, name: string) => downloadLabelFile(path, name).catch((e: Error) => toast.error(e.message));
  const selectable = todo.filter((p) => p.problems.length === 0).slice(0, MAX_BATCH);
  const notConnected = methodsError && isNotConnected(methodsError);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-light text-foreground">Shipping labels</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Buy carrier labels for deliveries that are being prepared, one by one in the order or in bulk here. EU
          destinations only for now. Create the delivery in the order first.
        </p>
      </div>

      <WeightSettingsBox />

      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {notConnected && (
        <p className="text-sm border border-border p-3 text-muted-foreground">
          Sendcloud is not connected yet, so labels cannot be bought. Deliveries and tracking numbers still work by hand
          in each order. See the setup steps in the docs.
        </p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">Ready for a label ({todo.length})</h2>
          <div className="flex gap-3 text-xs">
            <button type="button" className="text-accent" onClick={() => setSelected(selectable.map((p) => p.row.id))}>
              Select all ready (max {MAX_BATCH})
            </button>
            <button type="button" className="text-muted-foreground" onClick={() => setSelected([])}>
              Clear
            </button>
          </div>
        </div>

        <div className="border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
                <th className="p-3 w-8" />
                <th className="p-3">Delivery</th>
                <th className="p-3">Order</th>
                <th className="p-3">Customer</th>
                <th className="p-3">To</th>
                <th className="p-3">Items</th>
                <th className="p-3">Est. weight</th>
                <th className="p-3">Check</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td>
                </tr>
              )}
              {!isLoading && todo.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No deliveries are waiting for a label.
                  </td>
                </tr>
              )}
              {todo.map(({ row, recipient, problems, weight }) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.delivery_number}`}
                      disabled={problems.length > 0}
                      checked={selected.includes(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  </td>
                  <td className="p-3 text-foreground">{row.delivery_number}</td>
                  <td className="p-3">
                    <Link to={`/admin/orders/${row.sales_orders?.id}`} className="text-muted-foreground">
                      {row.sales_orders?.order_number}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{recipient?.name}</td>
                  <td className="p-3 text-muted-foreground">
                    {recipient ? `${recipient.postal_code} ${recipient.city}, ${recipient.country || "?"}` : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">{row.delivery_order_items.reduce((s, i) => s + i.quantity, 0)}</td>
                  <td className="p-3 text-muted-foreground">{weight} g</td>
                  <td className="p-3 text-xs">
                    {problems.length === 0 ? (
                      <span className="text-emerald-700">Ready</span>
                    ) : (
                      <span className="text-amber-700">
                        {problems.join(", ")}.{" "}
                        <Link to={`/admin/orders/${row.sales_orders?.id}`} className="text-accent">
                          Fix in the order
                        </Link>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {chosen.length > 0 && (
          <div className="border border-border p-4 space-y-3 max-w-xl">
            <p className="text-sm text-foreground">{chosen.length} selected</p>
            {!sameCountry ? (
              <p className="text-xs text-amber-700">Select deliveries that go to the same country: services and prices depend on it.</p>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Shipping service ({EU_COUNTRIES[countries[0]]}, up to {heaviest} g)</Label>
                {methodsError && !notConnected ? (
                  <p className="text-xs text-destructive">{(methodsError as Error).message}</p>
                ) : (
                  <Select value={effectiveMethod} onValueChange={setMethodId} disabled={methods.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder={isFetching ? "Loading services…" : "No service fits all selected parcels"} />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.name} · {formatPrice(m.price)} per label
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {Number.isFinite(lightest) && lightest !== heaviest && (
                  <p className="text-[11px] text-muted-foreground">Parcels weigh between {lightest} and {heaviest} g; the service must fit both.</p>
                )}
              </div>
            )}
            <Button
              size="sm"
              disabled={!sameCountry || !effectiveMethod || buyAll.isPending || !!notConnected}
              onClick={() => {
                if (window.confirm(`Buy ${chosen.length} label(s)? Sendcloud will charge you for them.`)) buyAll.mutate();
              }}
            >
              {progress ?? `Buy ${chosen.length} label(s)`}
            </Button>
          </div>
        )}

        {results.length > 0 && (
          <ul className="text-xs space-y-1">
            {results.map((r) => (
              <li key={r.id} className={r.ok ? "text-emerald-700" : "text-destructive"}>
                {r.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Labels bought, waiting for the carrier ({done.length})</h2>
        <div className="border border-border divide-y divide-border text-sm">
          {done.length === 0 && <p className="p-4 text-muted-foreground">None.</p>}
          {done.map(({ row }) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span>
                <Link to={`/admin/orders/${row.sales_orders?.id}`} className="text-foreground">
                  {row.delivery_number}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {row.sales_orders?.order_number} · {row.label_service || row.carrier} · {row.tracking_number} · cost{" "}
                  {formatPrice(Number(row.label_cost))} · {formatDate(row.label_created_at)}
                </span>
              </span>
              <span className="flex gap-2">
                {row.label_a6_path && (
                  <Button size="sm" variant="outline" onClick={() => download(row.label_a6_path, `label-${row.delivery_number}-a6.pdf`)}>
                    A6
                  </Button>
                )}
                {row.label_a4_path && (
                  <Button size="sm" variant="outline" onClick={() => download(row.label_a4_path, `label-${row.delivery_number}-a4.pdf`)}>
                    A4
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (window.confirm("Cancel this label?")) cancel.mutate(row.id);
                  }}
                >
                  Cancel
                </Button>
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          After the carrier collects a parcel, open the order and press "Picked up by carrier". Tracking can take a few
          hours to show up after the first scan.
        </p>
      </section>
    </div>
  );
};

export default AdminShippingLabels;
