import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAdminProducts, resolveImages, type ProductRow } from "@/lib/catalog";
import { formatPrice } from "@/data/products";
import { logAudit } from "@/lib/audit";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 8;

type StatusFilter = "all" | "published" | "draft" | "archived" | "preorder";

const AdminProducts = () => {
  const queryClient = useQueryClient();
  const { canManageProducts } = useAdminAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
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
      return matchesTerm && matchesStatus;
    });
  }, [products, search, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

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

      <div className="flex flex-wrap gap-3">
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
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as StatusFilter);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40">
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
      </div>

      {canManageProducts && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border border-border px-4 py-3">
          <span className="text-sm text-foreground">{selected.length} selected</span>
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
              <th className="p-3">SKU</th>
              <th className="p-3">Category</th>
              <th className="p-3">Price</th>
              <th className="p-3">Stock</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  Loading products…
                </td>
              </tr>
            )}
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  No products match these filters.
                </td>
              </tr>
            )}
            {visible.map((product) => {
              const image = thumbs?.get(product.id)?.[0];
              const low = product.stock <= product.low_stock_threshold;
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
                          className="w-10 h-10 object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-muted" />
                      )}
                      <Link to={`/admin/products/${product.id}`} className="text-foreground">
                        {product.name}
                      </Link>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{product.sku}</td>
                  <td className="p-3 text-muted-foreground">{product.category}</td>
                  <td className="p-3 text-muted-foreground">
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
                        Preorder ·{" "}
                        {product.preorder_deposit_type === "percent"
                          ? `${Number(product.preorder_deposit_value)}% deposit`
                          : `${formatPrice(Number(product.preorder_deposit_value))} deposit`}
                      </span>
                    )}
                  </td>
                  <td className={`p-3 ${low ? "text-destructive" : "text-muted-foreground"}`}>
                    {product.stock}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {product.archived_at ? "Archived" : product.status}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {canManageProducts && !product.archived_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleStatus.mutate(product)}
                      >
                        {product.status === "published" ? "Unpublish" : "Publish"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
