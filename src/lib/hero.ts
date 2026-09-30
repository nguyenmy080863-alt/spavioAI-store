import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { PRODUCT_BUCKET } from "@/lib/catalog";

export interface HeroBannerRow {
  id: string;
  is_active: boolean;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta_label: string;
  cta_href: string;
  image_alt: string;
  storage_path: string | null;
  image_url: string | null;
  overlay_opacity: number;
  text_align: string;
  updated_at: string;
}

export interface HeroBanner extends HeroBannerRow {
  /** Displayable image URL (signed when stored in the bucket). */
  resolvedImageUrl: string | null;
}

const SELECT =
  "id, is_active, eyebrow, title, subtitle, cta_label, cta_href, image_alt, storage_path, image_url, overlay_opacity, text_align, updated_at";

export const resolveHeroImage = async (row: HeroBannerRow): Promise<string | null> => {
  if (row.storage_path) {
    const { data } = await supabase.storage
      .from(PRODUCT_BUCKET)
      .createSignedUrl(row.storage_path, 60 * 60);
    if (data?.signedUrl) return data.signedUrl;
  }
  return row.image_url?.trim() ? row.image_url : null;
};

/** Single hero banner record used by the landing page and the admin editor. */
export const fetchHeroBanner = async (): Promise<HeroBanner | null> => {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from("hero_banner")
    .select(SELECT)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as HeroBannerRow;
  return { ...row, resolvedImageUrl: await resolveHeroImage(row) };
};

export const updateHeroBanner = async (
  id: string,
  patch: Partial<Omit<HeroBannerRow, "id" | "updated_at">>,
) => {
  const { error } = await supabase
    .from("hero_banner")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
};
