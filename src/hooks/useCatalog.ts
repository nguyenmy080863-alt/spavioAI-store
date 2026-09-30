import { useQuery } from "@tanstack/react-query";
import { fetchStorefrontProducts, type CatalogProduct } from "@/lib/catalog";

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
