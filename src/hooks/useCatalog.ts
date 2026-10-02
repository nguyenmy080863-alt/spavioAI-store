import { useQuery } from "@tanstack/react-query";
import { fetchStorefrontProducts, type CatalogProduct } from "@/lib/catalog";
import { fetchActiveCollections, fetchProductTranslations } from "@/lib/productContent";

export const useStorefrontProducts = () =>
  useQuery({
    queryKey: ["storefront-products"],
    queryFn: fetchStorefrontProducts,
    staleTime: 60_000,
  });

export const useStorefrontProduct = (slug: string | undefined) => {
  const query = useStorefrontProducts();
  const product: CatalogProduct | undefined = query.data?.find((p) => p.slug === slug);
  return { ...query, product };
};

/** Admin-managed translations of product texts (empty until the first one is saved). */
export const useProductTranslations = () =>
  useQuery({
    queryKey: ["product-translations"],
    queryFn: fetchProductTranslations,
    staleTime: 60_000,
    retry: false,
  });

/** Admin-managed collections (hand-picked lists). */
export const useCollections = () =>
  useQuery({
    queryKey: ["storefront-collections"],
    queryFn: fetchActiveCollections,
    staleTime: 60_000,
    retry: false,
  });
