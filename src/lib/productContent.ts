import { db } from "@/lib/orders";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

export type ContentLang = "de" | "en" | "vi";
export const CONTENT_LANGS: { code: ContentLang; label: string }[] = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
  { code: "vi", label: "Tiếng Việt" },
];

export interface ProductTexts {
  name: string;
  effect: string;
  description: string;
  editors_notes: string;
}

export const emptyTexts = (): ProductTexts => ({ name: "", effect: "", description: "", editors_notes: "" });

/** product slug -> language -> texts. Empty before migration 0023 (the storefront keeps working). */
export type TranslationMap = Record<string, Partial<Record<ContentLang, ProductTexts>>>;

export const fetchProductTranslations = async (): Promise<TranslationMap> => {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await db
    .from("product_translations")
    .select("lang, name, effect, description, editors_notes, products(slug)");
  if (error || !data) return {};
  const map: TranslationMap = {};
  for (const row of data as unknown as (ProductTexts & { lang: ContentLang; products: { slug: string } | null })[]) {
    const slug = row.products?.slug;
    if (!slug) continue;
    (map[slug] ??= {})[row.lang] = {
      name: row.name,
      effect: row.effect,
      description: row.description,
      editors_notes: row.editors_notes,
    };
  }
  return map;
};

/** Translations of one product for the admin form. */
export const fetchTranslationsOf = async (productId: string): Promise<Partial<Record<ContentLang, ProductTexts>>> => {
  const { data, error } = await db.from("product_translations").select("*").eq("product_id", productId);
  if (error || !data) return {};
  return Object.fromEntries(
    (data as (ProductTexts & { lang: ContentLang })[]).map((row) => [
      row.lang,
      { name: row.name, effect: row.effect, description: row.description, editors_notes: row.editors_notes },
    ]),
  );
};

/** Saves the three languages: a language with no text is removed. */
export const saveTranslations = async (productId: string, texts: Record<ContentLang, ProductTexts>) => {
  for (const { code } of CONTENT_LANGS) {
    const t = texts[code];
    const empty = !t.name.trim() && !t.effect.trim() && !t.description.trim() && !t.editors_notes.trim();
    if (empty) {
      const { error } = await db.from("product_translations").delete().eq("product_id", productId).eq("lang", code);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("product_translations").upsert({
        product_id: productId,
        lang: code,
        name: t.name.trim(),
        effect: t.effect.trim(),
        description: t.description.trim(),
        editors_notes: t.editors_notes.trim(),
      });
      if (error) throw new Error(error.message);
    }
  }
};

export interface StoreCollection {
  slug: string;
  titles: Record<ContentLang, string>;
  /** Product slugs in display order. */
  productSlugs: string[];
}

/** Active collections for the storefront (empty before migration 0023). */
export const fetchActiveCollections = async (): Promise<StoreCollection[]> => {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await db
    .from("collections")
    .select("slug, title_de, title_en, title_vi, active, collection_products(position, products(slug, status, archived_at))")
    .eq("active", true);
  if (error || !data) return [];
  return (
    data as unknown as {
      slug: string;
      title_de: string;
      title_en: string;
      title_vi: string;
      collection_products: { position: number; products: { slug: string } | null }[];
    }[]
  ).map((row) => ({
    slug: row.slug,
    titles: { de: row.title_de, en: row.title_en, vi: row.title_vi },
    productSlugs: row.collection_products
      .slice()
      .sort((a, b) => a.position - b.position)
      .flatMap((entry) => (entry.products ? [entry.products.slug] : [])),
  }));
};
