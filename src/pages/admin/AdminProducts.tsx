import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAdminProducts, resolveImages, type ProductRow } from "@/lib/catalog";
import { CATEGORIES } from "@/data/products";
import { resources } from "@/i18n";
import { useProductTranslations } from "@/hooks/useCatalog";
import { duplicateProduct } from "@/lib/productAdmin";
import { fetchProductWeights } from "@/lib/shipping";
import type { ContentLang } from "@/lib/productContent";
import { formatPrice } from "@/data/products";
import { logAudit } from "@/lib/audit";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZES = [25, 50, 100];

type StatusFilter = "all" | "published" | "draft" | "archived" | "preorder";
type StockFilter = "all" | "low" | "out";
type SortKey = "updated" | "name" | "price-low" | "price-high" | "stock-low" | "stock-high";

const LANGS: ContentLang[] = ["de", "en", "vi"];

const TEXT_STATUS = {
  published: "bg-emerald-500/10 text-emerald-700",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-destructive/10 text-destructive",
} as const;

/** What is still missing on a product page: image, description, weight, translations. */
const healthIssues = (
  product: ProductRow,
  hasImage: boolean,
  weight: number | null | undefined,
  dbTexts: Record<string, Partial<Record<ContentLang, { name: string }>>> | undefined,
) => {
  const issues: string[] = [];
  if (!hasImage) issues.push("no image");
  if ((product.description ?? "").trim().length < 40) issues.push("short description");
  if (!weight) issues.push("no weight");
  const missing = LANGS.filter((lang) => {
    const inDb = dbTexts?.[product.slug]?.[lang]?.name;
    const inCode = (resources[lang].products as { items?: Record<string, { name?: string }> }).items?.[product.slug]?.name;
    return !inDb && !inCode;
  });
  if (missing.length > 0) issues.push(`no ${missing.join("/").toUpperCase()} translation`);
  return issues;
};

const AdminProducts = () => {
  const queryClient = useQueryClient();
  const { canManageProducts } = useAdminAuth();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [noImageOnly, setNoImageOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("updated");
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: fetchAdminProducts,
  });

  const { data: thumbs } = useQuery({
    queryKey: ["admin-product-thumbs", products.map((p) => p.id).join(",")],
    queryFn: () => resolveImages(products),
    enabled: products.length > 0,
  });

  const { data: dbTexts } = useProductTranslations();
  const { data: weights } = useQuery({
    queryKey: ["admin-product-weights", products.map((p) => p.id).join(",")],
    queryFn: () => fetchProductWeights(products.map((p) => p.id)),
    enabled: products.length > 0,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matching = products.filter((product) => {
      const matchesTerm =
        !term ||
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term);
      const matchesStatus =
        status === "all"
          ? true
          : status === "archived"
            ? Boolean(product.archived_at)
            : status === "preorder"
              ? product.preorder_enabled && !product.archived_at
              : product.status === status && !product.archived_at;
      const matchesCategory = category === "all" || product.category === category;
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "out" ? product.stock <= 0 : product.stock > 0 && product.stock <= product.low_stock_threshold);
      const matchesImage = !noImageOnly || !(thumbs?.get(product.id)?.length ?? 0);
      return matchesTerm && matchesStatus && matchesCategory && matchesStock && matchesImage;
    });
    const price = (p: ProductRow) => Number(p.sale_price ?? p.price);
    return [...matching].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "price-low") return price(a) - price(b);
      if (sort === "price-high") return price(b) - price(a);
      if (sort === "stock-low") return a.stock - b.stock;
      if (sort === "stock-high") return b.stock - a.stock;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [products, search, status, category, stockFilter, noImageOnly, sort, thumbs]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    void queryClient.invalidateQueries({ queryKey: ["storefront-products"] });
  };

  const toggleStatus = useMutation({
    mutationFn: async (product: ProductRow) => {
      const next = product.status === "published" ? "draft" : "published";
      const { error } = await supabase.from("products").update({ status: next }).eq("id", product.id);
      if (error) throw error;
      await logAudit("status_change", "product", product.id, {
        name: product.name,
        from: product.status,
        to: next,
      });
      return next;
    },
    onSuccess: (next) => {
      toast.success(`Product moved to ${next}`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setPublished = useMutation({
    mutationFn: async ({ ids, publish }: { ids: string[]; publish: boolean }) => {
      const { error } = await supabase
        .from("products")
        .update({ status: publish ? "published" : "draft" })
        .in("id", ids)
        .is("archived_at", null);
      if (error) throw error;
      await Promise.all(ids.map((id) => logAudit("status_change", "product", id, { to: publish ? "published" : "draft" })));
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.publish ? "Products published" : "Products moved to draft");
      setSelected([]);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => duplicateProduct(id),
    onSuccess: (id) => {
      toast.success("Product duplicated as a draft (without images and with stock 0)");
      invalidate();
      navigate(`/admin/products/${id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: async ({ ids, restore }: { ids: string[]; restore?: boolean }) => {
      const { error } = await supabase
        .from("products")
        .update({ archived_at: restore ? null : new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      await Promise.all(
        ids.map((id) => logAudit(restore ? "restore" : "archive", "product", id, {})),
      );
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.restore ? "Products restored" : "Products archived");
      setSelected([]);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const hardDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("products").delete().in("id", ids);
      if (error) throw error;
      await Promise.all(ids.map((id) => logAudit("delete", "product", id, {})));
    },
    onSuccess: () => {
      toast.success("Products deleted permanently");
      setSelected([]);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.includes(p.id));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Products</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} matching products</p>
        </div>
        {canManageProducts && (
          <Button asChild size="sm">
            <Link to="/admin/products/new">New product</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Search name, SKU or category"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
          maxLength={100}
        />
        <Select value={status} onValueChange={(value) => { setStatus(value as StatusFilter); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="preorder">Preorder</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={(value) => { setCategory(value); setPage(0); }}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {entry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={(value) => { setStockFilter(value as StockFilter); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Recently updated</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="price-low">Price: low to high</SelectItem>
            <SelectItem value="price-high">Price: high to low</SelectItem>
            <SelectItem value="stock-low">Stock: low to high</SelectItem>
            <SelectItem value="stock-high">Stock: high to low</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={noImageOnly} onChange={(e) => { setNoImageOnly(e.target.checked); setPage(0); }} />
          Without image
        </label>
      </div>

      {canManageProducts && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border border-border px-4 py-3">
          <span className="text-sm text-foreground">{selected.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => setPublished.mutate({ ids: selected, publish: true })}>
            Publish
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPublished.mutate({ ids: selected, publish: false })}>
            Unpublish
          </Button>
          <Button size="sm" variant="outline" onClick={() => archive.mutate({ ids: selected })}>
            Archive
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => archive.mutate({ ids: selected, restore: true })}
          >
            Restore
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (window.confirm(`Permanently delete ${selected.length} product(s)?`)) {
                hardDelete.mutate(selected);
              }
            }}
          >
            Delete
          </Button>
        </div>
      )}

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3 w-10">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) =>
                    setSelected(checked ? visible.map((p) => p.id) : [])
                  }
                  aria-label="Select all"
                />
              </th>
              <th className="p-3">Product</th>
              <th className="p-3">Price</th>
              <th className="p-3">Stock</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Loading products…
                </td>
              </tr>
            )}
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No products match these filters.
                </td>
              </tr>
            )}
            {visible.map((product) => {
              const image = thumbs?.get(product.id)?.[0];
              const low = product.stock <= product.low_stock_threshold;
              const issues =
                thumbs && weights
                  ? healthIssues(product, (thumbs.get(product.id)?.length ?? 0) > 0, weights[product.id], dbTexts)
                  : [];
              return (
                <tr key={product.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Checkbox
                      checked={selected.includes(product.id)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) =>
                          checked ? [...prev, product.id] : prev.filter((id) => id !== product.id),
                        )
                      }
                      aria-label={`Select ${product.name}`}
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {image ? (
                        <img
                          src={image}
                          alt={product.name}
                          className="w-10 h-10 object-cover shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-muted shrink-0" />
                      )}
                      <div className="min-w-0">
                        <Link to={`/admin/products/${product.id}`} className="text-foreground">
                          {product.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {product.sku} · {product.category}
                        </p>
                        {issues.length > 0 && (
                          <p className="text-[11px] text-amber-700" title={issues.join(", ")}>
                            {issues.length} to fix: {issues.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">
                    {product.sale_price !== null ? (
                      <span>
                        <span className="line-through mr-1">{formatPrice(Number(product.price))}</span>
                        {formatPrice(Number(product.sale_price))}
                      </span>
                    ) : (
                      formatPrice(Number(product.price))
                    )}
                    {product.preorder_enabled && (
                      <span className="mt-1 block w-fit rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                        Preorder
                      </span>
                    )}
                  </td>
                  <td className={`p-3 ${low ? "text-destructive" : "text-muted-foreground"}`}>
                    {product.stock}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        TEXT_STATUS[product.archived_at ? "archived" : product.status === "published" ? "published" : "draft"]
                      }`}
                    >
                      {product.archived_at ? "Archived" : product.status === "published" ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {canManageProducts && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/admin/products/${product.id}`}>Edit</Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" aria-label={`More actions for ${product.name}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!product.archived_at && (
                              <DropdownMenuItem onSelect={() => toggleStatus.mutate(product)}>
                                {product.status === "published" ? "Unpublish" : "Publish"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem disabled={duplicate.isPending} onSelect={() => duplicate.mutate(product.id)}>
                              Duplicate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>Rows per page</span>
        <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(0); }}>
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {currentPage + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default AdminProducts;
