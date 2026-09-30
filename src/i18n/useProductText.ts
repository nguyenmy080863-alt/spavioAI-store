import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { categoryToSlug } from "@/data/products";

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
 * Products without a translation (e.g. added later in the admin panel) keep their stored text.
 */
export const useProductText = () => {
  const { t } = useTranslation("products");

  const categoryLabel = useCallback(
    (category: string) => t(`categories.${categoryToSlug(category)}`, { defaultValue: category }),
    [t],
  );

  const localize = useCallback(
    <P extends TranslatableProduct>(p: P): P & { categoryLabel: string } => ({
      ...p,
      name: t(`items.${p.id}.name`, { defaultValue: p.name }),
      effect: t(`items.${p.id}.effect`, { defaultValue: p.effect ?? "" }),
      description: t(`items.${p.id}.description`, { defaultValue: p.description ?? "" }),
      editorsNotes: t(`items.${p.id}.editorsNotes`, { defaultValue: p.editorsNotes ?? "" }),
      categoryLabel: categoryLabel(p.category),
    }),
    [t, categoryLabel],
  );

  return { localize, categoryLabel };
};
