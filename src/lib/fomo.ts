import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export interface FomoCampaign {
  id: string;
  name: string;
  is_active: boolean;
  headline: string;
  duration_hours: number;
  reset_mode: "loop" | "delay";
  reset_delay_hours: number;
  total_fake_stock: number;
  initial_sold_percent: number;
  auto_increment_enabled: boolean;
  increment_min: number;
  increment_max: number;
  increment_interval_seconds: number;
  max_sold_percent: number;
}

export interface FomoCampaignProduct {
  id: string;
  campaign_id: string;
  product_id: string;
  discount_percent: number | null;
  display_sale_price: number | null;
}

export interface FomoCampaignBundle {
  campaign: FomoCampaign;
  /** Keyed by product slug for storefront lookups. */
  offersBySlug: Record<string, { discountPercent: number | null; salePrice: number | null }>;
  productIds: string[];
}

const CAMPAIGN_SELECT =
  "id, name, is_active, headline, duration_hours, reset_mode, reset_delay_hours, total_fake_stock, initial_sold_percent, auto_increment_enabled, increment_min, increment_max, increment_interval_seconds, max_sold_percent";

const normalise = (row: Record<string, unknown>): FomoCampaign => ({
  id: row.id as string,
  name: row.name as string,
  is_active: row.is_active as boolean,
  headline: row.headline as string,
  duration_hours: Number(row.duration_hours),
  reset_mode: (row.reset_mode as "loop" | "delay") ?? "loop",
  reset_delay_hours: Number(row.reset_delay_hours),
  total_fake_stock: Number(row.total_fake_stock),
  initial_sold_percent: Number(row.initial_sold_percent),
  auto_increment_enabled: row.auto_increment_enabled as boolean,
  increment_min: Number(row.increment_min),
  increment_max: Number(row.increment_max),
  increment_interval_seconds: Number(row.increment_interval_seconds),
  max_sold_percent: Number(row.max_sold_percent),
});

/** Demo campaign shown when running on the bundled catalog (no Supabase). */
const LOCAL_DEMO_CAMPAIGN: FomoCampaignBundle = {
  campaign: {
    id: "local-glow-week",
    name: "Glow Week",
    is_active: true,
    headline: "Glow Week Sale",
    duration_hours: 24,
    reset_mode: "loop",
    reset_delay_hours: 0,
    total_fake_stock: 120,
    initial_sold_percent: 42,
    auto_increment_enabled: true,
    increment_min: 1,
    increment_max: 2,
    increment_interval_seconds: 45,
    max_sold_percent: 92,
  },
  offersBySlug: {
    "sculpt-microcurrent": { discountPercent: 20, salePrice: null },
    "thermalift-rf": { discountPercent: 15, salePrice: null },
    "aura-ionic-dryer": { discountPercent: 10, salePrice: null },
    "contour-body-sculptor": { discountPercent: 15, salePrice: null },
  },
  productIds: ["sculpt-microcurrent", "thermalift-rf", "aura-ionic-dryer", "contour-body-sculptor"],
};

/** Active campaign plus its product offers, resolved for the storefront. */
export const fetchActiveFomoCampaign = async (): Promise<FomoCampaignBundle | null> => {
  if (!isSupabaseConfigured) return LOCAL_DEMO_CAMPAIGN;
  const { data, error } = await supabase
    .from("fomo_campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const campaign = normalise(data as Record<string, unknown>);

  const { data: links, error: linkError } = await supabase
    .from("fomo_campaign_products")
    .select("product_id, discount_percent, display_sale_price, products(slug)")
    .eq("campaign_id", campaign.id);
  if (linkError) throw linkError;

  const offersBySlug: FomoCampaignBundle["offersBySlug"] = {};
  const productIds: string[] = [];
  (links ?? []).forEach((link) => {
    const row = link as unknown as {
      product_id: string;
      discount_percent: number | null;
      display_sale_price: number | null;
      products: { slug: string } | null;
    };
    productIds.push(row.product_id);
    if (row.products?.slug) {
      offersBySlug[row.products.slug] = {
        discountPercent: row.discount_percent === null ? null : Number(row.discount_percent),
        salePrice: row.display_sale_price === null ? null : Number(row.display_sale_price),
      };
    }
  });

  return { campaign, offersBySlug, productIds };
};

/** The single campaign config row for the admin editor. */
export const fetchAdminFomoCampaign = async (): Promise<FomoCampaign | null> => {
  const { data, error } = await supabase
    .from("fomo_campaigns")
    .select(CAMPAIGN_SELECT)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? normalise(data as Record<string, unknown>) : null;
};

export const fetchFomoCampaignProducts = async (
  campaignId: string,
): Promise<FomoCampaignProduct[]> => {
  const { data, error } = await supabase
    .from("fomo_campaign_products")
    .select("id, campaign_id, product_id, discount_percent, display_sale_price")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as FomoCampaignProduct),
    discount_percent:
      row.discount_percent === null ? null : Number(row.discount_percent),
    display_sale_price:
      row.display_sale_price === null ? null : Number(row.display_sale_price),
  }));
};

/** Price shown next to the countdown: explicit sale price wins over a percentage. */
export const fomoOfferPrice = (
  basePrice: number,
  offer: { discountPercent: number | null; salePrice: number | null } | undefined,
): number | null => {
  if (!offer) return null;
  if (offer.salePrice !== null) return offer.salePrice;
  if (offer.discountPercent !== null)
    return Math.round(basePrice * (1 - offer.discountPercent / 100) * 100) / 100;
  return null;
};
