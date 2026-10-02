import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/orders";
import { fetchTranslationsOf, saveTranslations, CONTENT_LANGS, emptyTexts, type ContentLang, type ProductTexts } from "@/lib/productContent";

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string;
}

/** A readable message for a failed product save (duplicate SKU or address, and so on). */
export const productErrorMessage = (error: unknown): string => {
  const e = error as PostgrestLikeError;
  const text = `${e?.message ?? ""} ${e?.details ?? ""}`;
  if (e?.code === "23505" || /duplicate key/i.test(text)) {
    if (/sku/i.test(text)) return "This SKU is already used by another product. Choose a different SKU.";
    if (/slug/i.test(text)) return "This storefront address is already used by another product. Choose a different one.";
    return "A product with the same unique value already exists.";
  }
  if (/row-level security|permission denied/i.test(text)) return "You do not have permission to change products.";
  return e?.message ?? "Something went wrong while saving the product.";
};

/**
 * Copies a product as a new draft: same texts, price, category and translations; stock 0; no
 * images (the image files belong to the original and deleting one product's image must never
 * affect another).
 */
export const duplicateProduct = async (productId: string): Promise<string> => {
  const { data: source, error } = await supabase.from("products").select("*").eq("id", productId).single();
  if (error || !source) throw new Error(productErrorMessage(error));

  const base = { ...source } as Record<string, unknown>;
  for (const key of ["id", "created_at", "updated_at", "archived_at", "position"]) delete base[key];

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const suffix = attempt === 1 ? "" : `-${attempt}`;
    const payload = {
      ...base,
      name: `${source.name} (copy${suffix ? ` ${attempt}` : ""})`,
      slug: `${source.slug}-copy${suffix}`,
      sku: `${source.sku}-COPY${suffix}`.slice(0, 40),
      status: "draft",
      stock: 0,
    };
    const { data, error: insertError } = await supabase.from("products").insert(payload as never).select("id").single();
    if (!insertError) {
      const translations = await fetchTranslationsOf(productId);
      const texts = Object.fromEntries(CONTENT_LANGS.map(({ code }) => [code, translations[code] ?? emptyTexts()])) as Record<ContentLang, ProductTexts>;
      await saveTranslations(data.id, texts).catch(() => undefined);
      const { data: weight } = await db.from("products").select("weight_grams").eq("id", productId).maybeSingle();
      if (weight?.weight_grams) await db.from("products").update({ weight_grams: weight.weight_grams }).eq("id", data.id);
      return data.id as string;
    }
    if (insertError.code !== "23505") throw new Error(productErrorMessage(insertError));
  }
  throw new Error("Could not find a free SKU for the copy. Rename the original SKU and try again.");
};
