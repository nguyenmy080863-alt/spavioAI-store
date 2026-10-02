import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { categoryToSlug } from "@/data/products";
import { useProductTranslations } from "@/hooks/useCatalog";
import type { ContentLang } from "@/lib/productContent";

interface TranslatableProduct {
  id: string;
  name: string;
  category: string;
  effect?: string;
  description?: string;
  editorsNotes?: string;
}

/**
 * Localizes product copy from the "products" namespace, keyed by product slug.
 * Translations saved in the admin panel win; products without any keep their stored text.
 */
export const useProductText = () => {
  const { t, i18n } = useTranslation("products");
  const { data: dbTexts } = useProductTranslations();
  const lang = (i18n.language === "en" || i18n.language === "vi" ? i18n.language : "de") as ContentLang;

  const categoryLabel = useCallback(
    (category: string) => t(`categories.${categoryToSlug(category)}`, { defaultValue: category }),
    [t],
  );

  const localize = useCallback(
    <P extends TranslatableProduct>(p: P): P & { categoryLabel: string } => {
      // Per field: admin translation, then the text in code (seeded products), then the stored text.
      const db = dbTexts?.[p.id]?.[lang];
      return {
        ...p,
        name: db?.name || t(`items.${p.id}.name`, { defaultValue: p.name }),
        effect: db?.effect || t(`items.${p.id}.effect`, { defaultValue: p.effect ?? "" }),
        description: db?.description || t(`items.${p.id}.description`, { defaultValue: p.description ?? "" }),
        editorsNotes: db?.editors_notes || t(`items.${p.id}.editorsNotes`, { defaultValue: p.editorsNotes ?? "" }),
        categoryLabel: categoryLabel(p.category),
      };
    },
    [t, categoryLabel, dbTexts, lang],
  );

  return { localize, categoryLabel };
};
