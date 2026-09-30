import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { LOCAL_ASSETS, products as localProducts, collectionImage, type Product } from "@/data/products";

export const PRODUCT_BUCKET = "product-images";

export interface ProductImageRow {
  id: string;
  url: string | null;
  asset_key: string | null;
  storage_path: string | null;
  position: number;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  sku: string;
  category: string;
  effect: string;
  description: string;
  editors_notes: string;
  price: number;
  sale_price: number | null;
  stock: number;
  low_stock_threshold: number;
  is_new: boolean;
  status: string;
  archived_at: string | null;
  position: number;
  hover_image_enabled: boolean;
  preorder_enabled: boolean;
  preorder_deposit_type: string;
  preorder_deposit_value: number;
  preorder_release_date: string | null;
  created_at: string;
  updated_at: string;
  product_images?: ProductImageRow[];
}

const PRODUCT_SELECT =
  "id, slug, name, sku, category, effect, description, editors_notes, price, sale_price, stock, low_stock_threshold, is_new, status, archived_at, position, hover_image_enabled, preorder_enabled, preorder_deposit_type, preorder_deposit_value, preorder_release_date, created_at, updated_at, product_images(id, url, asset_key, storage_path, position)";

const signedUrlCache = new Map<string, string>();

/** Resolve every image of a product row to a displayable URL. */
export const resolveImages = async (rows: ProductRow[]): Promise<Map<string, string[]>> => {
  const paths = new Set<string>();
  rows.forEach((row) =>
    (row.product_images ?? []).forEach((img) => {
      if (img.storage_path && !signedUrlCache.has(img.storage_path)) paths.add(img.storage_path);
    }),
  );

  if (paths.size > 0) {
    const list = [...paths];
    const { data } = await supabase.storage
      .from(PRODUCT_BUCKET)
      .createSignedUrls(list, 60 * 60);
    data?.forEach((entry, index) => {
      if (entry.signedUrl) signedUrlCache.set(list[index], entry.signedUrl);
    });
  }

  const result = new Map<string, string[]>();
  rows.forEach((row) => {
    const urls = (row.product_images ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((img) => {
        if (img.asset_key && LOCAL_ASSETS[img.asset_key]) return LOCAL_ASSETS[img.asset_key];
        if (img.storage_path) return signedUrlCache.get(img.storage_path) ?? "";
        return img.url ?? "";
      })
      .filter(Boolean);
    result.set(row.id, urls);
  });
  return result;
};

export interface CatalogProduct extends Product {
  slug: string;
  images: string[];
  hoverImageEnabled: boolean;
}


export const toCatalogProduct = (row: ProductRow, images: string[]): CatalogProduct => {
  const regularPrice = Number(row.price);
  const sale = row.sale_price === null ? null : Number(row.sale_price);
  return {
  id: row.slug,
  slug: row.slug,
  name: row.name,
  category: row.category,
  price: regularPrice,
  salePrice: sale !== null && sale > 0 && sale < regularPrice ? sale : null,
  image: images[0] ?? collectionImage,
  images: images.length > 0 ? images : [collectionImage],
  isNew: row.is_new,
  hoverImageEnabled: row.hover_image_enabled !== false,
  effect: row.effect,
  description: row.description,
  editorsNotes: row.editors_notes,
  stock: row.stock,
  preorder: row.preorder_enabled
    ? {
        depositType: row.preorder_deposit_type === "percent" ? "percent" : "fixed",
        depositValue: Number(row.preorder_deposit_value),
        releaseDate: row.preorder_release_date,
      }
    : null,
  };
};

/** Bundled catalog used when no Supabase project is configured. */
export const localCatalog = (): CatalogProduct[] =>
  localProducts.map((p) => ({
    ...p,
    slug: p.id,
    images: [p.image],
    hoverImageEnabled: false,
    salePrice: p.salePrice != null && p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : null,
  }));

/** Published, non-archived products for the storefront. */
export const fetchStorefrontProducts = async (): Promise<CatalogProduct[]> => {
  if (!isSupabaseConfigured) return localCatalog();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "published")
    .is("archived_at", null)
    .order("position", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as ProductRow[];
  const images = await resolveImages(rows);
  return rows.map((row) => toCatalogProduct(row, images.get(row.id) ?? []));
};

/** Every product, including drafts and archived rows (admin only). */
export const fetchAdminProducts = async (): Promise<ProductRow[]> => {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProductRow[];
};

export const fetchAdminProduct = async (id: string): Promise<ProductRow | null> => {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as ProductRow | null;
};

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
