import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { logAudit } from "@/lib/audit";
import { fetchAdminProducts } from "@/lib/catalog";
import {
  fetchAdminFomoCampaign,
  fetchFomoCampaignProducts,
  type FomoCampaign,
} from "@/lib/fomo";
import { formatPrice } from "@/data/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OfferDraft {
  selected: boolean;
  discountPercent: string;
  salePrice: string;
}

const numberOrNull = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const AdminFomo = () => {
  const { canManageProducts } = useAdminAuth();
  const queryClient = useQueryClient();

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["admin-fomo-campaign"],
    queryFn: fetchAdminFomoCampaign,
  });
  const { data: products = [] } = useQuery({
    queryKey: ["admin-products"],
    queryFn: fetchAdminProducts,
  });
  const { data: links = [] } = useQuery({
    queryKey: ["admin-fomo-products", campaign?.id],
    queryFn: () => fetchFomoCampaignProducts(campaign!.id),
    enabled: Boolean(campaign?.id),
  });

  const [form, setForm] = useState<FomoCampaign | null>(null);
  const [offers, setOffers] = useState<Record<string, OfferDraft>>({});

  useEffect(() => {
    if (campaign) setForm(campaign);
  }, [campaign]);

  useEffect(() => {
    const next: Record<string, OfferDraft> = {};
    links.forEach((link) => {
      next[link.product_id] = {
        selected: true,
        discountPercent:
          link.discount_percent === null ? "" : String(link.discount_percent),
        salePrice:
          link.display_sale_price === null ? "" : String(link.display_sale_price),
      };
    });
    setOffers(next);
  }, [links]);

  const activeProducts = useMemo(
    () => products.filter((p) => p.archived_at === null),
    [products],
  );

  const update = <K extends keyof FomoCampaign>(key: K, value: FomoCampaign[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const setOffer = (productId: string, patch: Partial<OfferDraft>) =>
    setOffers((prev) => ({
      ...prev,
      [productId]: {
        selected: false,
        discountPercent: "",
        salePrice: "",
        ...prev[productId],
        ...patch,
      },
    }));

  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("Nothing to save");
      if (form.duration_hours <= 0) throw new Error("Timer duration must be greater than 0.");
      if (form.total_fake_stock <= 0) throw new Error("Total fake stock must be greater than 0.");
      if (form.initial_sold_percent < 0 || form.initial_sold_percent > 100)
        throw new Error("Initial sold percentage must be between 0 and 100.");
      if (form.max_sold_percent < form.initial_sold_percent)
        throw new Error("Maximum sold percentage cannot be below the initial percentage.");
      if (form.increment_max < form.increment_min)
        throw new Error("Increment maximum cannot be below the minimum.");
      if (form.reset_mode === "delay" && form.reset_delay_hours <= 0)
        throw new Error("Set a reset delay greater than 0 hours.");

      const { error } = await supabase
        .from("fomo_campaigns")
        .update({
          headline: form.headline,
          is_active: form.is_active,
          duration_hours: form.duration_hours,
          reset_mode: form.reset_mode,
          reset_delay_hours: form.reset_mode === "delay" ? form.reset_delay_hours : 0,
          total_fake_stock: form.total_fake_stock,
          initial_sold_percent: form.initial_sold_percent,
          auto_increment_enabled: form.auto_increment_enabled,
          increment_min: form.increment_min,
          increment_max: form.increment_max,
          increment_interval_seconds: form.increment_interval_seconds,
          max_sold_percent: form.max_sold_percent,
        })
        .eq("id", form.id);
      if (error) throw error;

      const selectedIds = Object.entries(offers)
        .filter(([, draft]) => draft.selected)
        .map(([productId]) => productId);

      const { error: deleteError } = await supabase
        .from("fomo_campaign_products")
        .delete()
        .eq("campaign_id", form.id);
      if (deleteError) throw deleteError;

      if (selectedIds.length > 0) {
        const rows = selectedIds.map((productId) => ({
          campaign_id: form.id,
          product_id: productId,
          discount_percent: numberOrNull(offers[productId].discountPercent),
          display_sale_price: numberOrNull(offers[productId].salePrice),
        }));
        const { error: insertError } = await supabase
          .from("fomo_campaign_products")
          .insert(rows);
        if (insertError) throw insertError;
      }

      await logAudit("update_fomo_campaign", "fomo_campaign", form.id, {
        is_active: form.is_active,
        duration_hours: form.duration_hours,
        products: selectedIds.length,
      });
    },
    onSuccess: () => {
      toast.success("Spavio AI Flash Sale saved");
      void queryClient.invalidateQueries({ queryKey: ["admin-fomo-campaign"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-fomo-products"] });
      void queryClient.invalidateQueries({ queryKey: ["fomo-campaign"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !form) {
    return <p className="text-sm text-muted-foreground">Loading campaign…</p>;
  }

  const readOnly = !canManageProducts;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Spavio AI Flash Sale</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Evergreen urgency widget: each visitor gets their own countdown and simulated
            stock bar. Prices charged at checkout stay unchanged.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="fomo-active" className="text-sm font-light">
            Active
          </Label>
          <Switch
            id="fomo-active"
            checked={form.is_active}
            disabled={readOnly}
            onCheckedChange={(checked) => update("is_active", checked)}
          />
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">Timer</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="headline">Headline</Label>
            <Input
              id="headline"
              value={form.headline}
              disabled={readOnly}
              onChange={(e) => update("headline", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration">Timer duration (hours)</Label>
            <Input
              id="duration"
              type="number"
              min={0.1}
              step={0.5}
              value={form.duration_hours}
              disabled={readOnly}
              onChange={(e) => update("duration_hours", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-mode">On expiry</Label>
            <Select
              value={form.reset_mode}
              disabled={readOnly}
              onValueChange={(value) => update("reset_mode", value as "loop" | "delay")}
            >
              <SelectTrigger id="reset-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="loop">Loop immediately</SelectItem>
                <SelectItem value="delay">Reset after X hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.reset_mode === "delay" && (
            <div className="space-y-2">
              <Label htmlFor="reset-delay">Reset delay (hours)</Label>
              <Input
                id="reset-delay"
                type="number"
                min={0.5}
                step={0.5}
                value={form.reset_delay_hours}
                disabled={readOnly}
                onChange={(e) => update("reset_delay_hours", Number(e.target.value))}
              />
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">Fake stock & progress bar</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="total-stock">Total fake stock</Label>
            <Input
              id="total-stock"
              type="number"
              min={1}
              value={form.total_fake_stock}
              disabled={readOnly}
              onChange={(e) => update("total_fake_stock", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="initial-sold">Initial sold (%)</Label>
            <Input
              id="initial-sold"
              type="number"
              min={0}
              max={100}
              value={form.initial_sold_percent}
              disabled={readOnly}
              onChange={(e) => update("initial_sold_percent", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-sold">Maximum sold (%)</Label>
            <Input
              id="max-sold"
              type="number"
              min={0}
              max={100}
              value={form.max_sold_percent}
              disabled={readOnly}
              onChange={(e) => update("max_sold_percent", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label className="block">Simulate live purchases</Label>
            <div className="flex items-center gap-3 h-10">
              <Switch
                checked={form.auto_increment_enabled}
                disabled={readOnly}
                onCheckedChange={(checked) => update("auto_increment_enabled", checked)}
              />
              <span className="text-xs text-muted-foreground">
                Adds items over time up to the maximum
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inc-min">Increment min</Label>
            <Input
              id="inc-min"
              type="number"
              min={0}
              value={form.increment_min}
              disabled={readOnly || !form.auto_increment_enabled}
              onChange={(e) => update("increment_min", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inc-max">Increment max</Label>
            <Input
              id="inc-max"
              type="number"
              min={0}
              value={form.increment_max}
              disabled={readOnly || !form.auto_increment_enabled}
              onChange={(e) => update("increment_max", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inc-interval">Every (seconds)</Label>
            <Input
              id="inc-interval"
              type="number"
              min={10}
              value={form.increment_interval_seconds}
              disabled={readOnly || !form.auto_increment_enabled}
              onChange={(e) =>
                update("increment_interval_seconds", Number(e.target.value))
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Preview: sold{" "}
          {Math.round((form.initial_sold_percent / 100) * form.total_fake_stock)}/
          {form.total_fake_stock} products at first visit.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">Products & discounts</h2>
        <p className="text-xs text-muted-foreground">
          Pick the products that show the countdown. Leave both fields empty to show the
          timer only; a sale price overrides a percentage.
        </p>
        <div className="border border-border divide-y divide-border">
          {activeProducts.map((product) => {
            const draft = offers[product.id];
            return (
              <div
                key={product.id}
                className="flex flex-wrap items-center gap-4 px-4 py-3"
              >
                <Checkbox
                  checked={Boolean(draft?.selected)}
                  disabled={readOnly}
                  onCheckedChange={(checked) =>
                    setOffer(product.id, { selected: Boolean(checked) })
                  }
                  aria-label={`Include ${product.name}`}
                />
                <div className="min-w-40 flex-1">
                  <p className="text-sm text-foreground">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {product.sku} · {formatPrice(Number(product.price))}
                  </p>
                </div>
                <Input
                  className="w-28"
                  placeholder="% off"
                  type="number"
                  min={0}
                  max={99}
                  value={draft?.discountPercent ?? ""}
                  disabled={readOnly || !draft?.selected}
                  onChange={(e) =>
                    setOffer(product.id, { discountPercent: e.target.value })
                  }
                />
                <Input
                  className="w-32"
                  placeholder="Sale price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft?.salePrice ?? ""}
                  disabled={readOnly || !draft?.selected}
                  onChange={(e) => setOffer(product.id, { salePrice: e.target.value })}
                />
              </div>
            );
          })}
          {activeProducts.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">No products yet.</p>
          )}
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          disabled={readOnly || save.isPending}
          onClick={() => save.mutate()}
          className="rounded-none"
        >
          {save.isPending ? "Saving…" : "Save campaign"}
        </Button>
      </div>
    </div>
  );
};

export default AdminFomo;
