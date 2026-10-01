import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAdminProducts, type ProductRow } from "@/lib/catalog";
import { logAudit } from "@/lib/audit";
import { db, fetchInventory } from "@/lib/orders";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StockFilter = "all" | "low" | "out" | "in";

const stockState = (product: ProductRow) =>
  product.stock <= 0 ? "out" : product.stock <= product.low_stock_threshold ? "low" : "in";

const STATE_LABEL = { out: "Out of stock", low: "Low stock", in: "In stock" } as const;
const STATE_STYLE = {
  out: "bg-destructive/10 text-destructive",
  low: "bg-amber-500/10 text-amber-700",
  in: "bg-emerald-500/10 text-emerald-700",
} as const;

/**
 * Draft of the Inventory page: stock levels and manual adjustments on top of the existing
 * `products.stock` column. Locations, adjustment history, transfers and purchase orders
 * need their own tables and are not built yet.
 */
const AdminInventory = () => {
  const queryClient = useQueryClient();
  const { canManageProducts } = useAdminAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [change, setChange] = useState("");
  const [reason, setReason] = useState("correction");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: fetchAdminProducts,
  });

  // Present once migration 0011 is applied; without it the page falls back to products.stock.
  const { data: inventory } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory, retry: false });
  const levels = useMemo(() => new Map((inventory ?? []).map((row) => [row.product_id, row])), [inventory]);

  const active = useMemo(() => products.filter((p) => !p.archived_at), [products]);

  const totals = useMemo(
    () => ({
      units: active.reduce((sum, p) => sum + (levels.get(p.id)?.on_hand ?? p.stock), 0),
      low: active.filter((p) => stockState(p) === "low").length,
      out: active.filter((p) => stockState(p) === "out").length,
    }),
    [active, levels],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return active.filter((p) => {
      const matchesTerm =
        !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term);
      return matchesTerm && (filter === "all" || stockState(p) === filter);
    });
  }, [active, search, filter]);

  const adjust = useMutation({
    mutationFn: async ({ product, delta }: { product: ProductRow; delta: number }) => {
      const level = levels.get(product.id);
      const current = level ? level.on_hand : product.stock;
      if (current + delta < 0) throw new Error(`Only ${current} on hand`);
      if (inventory) {
        const { error } = await db.rpc("adjust_inventory", {
          p_product_id: product.id,
          p_change: delta,
          p_reason: reason,
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("products").update({ stock: current + delta }).eq("id", product.id);
        if (error) throw error;
      }
      await logAudit("stock_adjustment", "product", product.id, {
        name: product.name,
        from: current,
        to: current + delta,
        reason,
      });
    },
    onSuccess: () => {
      toast.success("Stock updated");
      setEditingId(null);
      setChange("");
      void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["storefront-products"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exportCsv = () => {
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [
      ["Name", "SKU", "Category", "On hand", "Incoming", "Committed", "Available", "Low stock threshold"].join(","),
      ...rows.map((p) =>
        [
          p.name,
          p.sku,
          p.category,
          levels.get(p.id)?.on_hand ?? p.stock,
          levels.get(p.id)?.in_transit ?? 0,
          levels.get(p.id)?.committed ?? 0,
          p.stock,
          p.low_stock_threshold,
        ].map(escape).join(","),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const submit = (product: ProductRow) => {
    const delta = Number(change);
    if (!Number.isInteger(delta) || delta === 0) {
      toast.error("Enter a whole number, e.g. 5 or -2");
      return;
    }
    adjust.mutate({ product, delta });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track stock levels and make manual adjustments.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          ["Units on hand", totals.units],
          ["Low stock", totals.low],
          ["Out of stock", totals.out],
        ].map(([label, value]) => (
          <div key={label} className="border border-border p-4">
            <p className="text-xs font-light text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-light text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search name or SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          maxLength={100}
        />
        <Select value={filter} onValueChange={(value) => setFilter(value as StockFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock levels</SelectItem>
            <SelectItem value="in">In stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3">Product</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Status</th>
              <th className="p-3">Low stock at</th>
              <th className="p-3">On hand</th>
              {inventory && <th className="p-3">Incoming</th>}
              {inventory && <th className="p-3">Committed</th>}
              {inventory && <th className="p-3">Available</th>}
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={inventory ? 9 : 6} className="p-6 text-center text-muted-foreground">
                  Loading inventory…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={inventory ? 9 : 6} className="p-6 text-center text-muted-foreground">
                  No products match these filters.
                </td>
              </tr>
            )}
            {rows.map((product) => {
              const state = stockState(product);
              const editing = editingId === product.id;
              const level = levels.get(product.id);
              const onHand = level ? level.on_hand : product.stock;
              return (
                <tr key={product.id} className="border-b border-border last:border-0 align-middle">
                  <td className="p-3">
                    <Link to={`/admin/products/${product.id}`} className="text-foreground">
                      {product.name}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{product.sku}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_STYLE[state]}`}>
                      {STATE_LABEL[state]}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{product.low_stock_threshold}</td>
                  <td className="p-3 text-foreground">
                    {editing ? (
                      <span className="text-muted-foreground">
                        {onHand} →{" "}
                        {Number.isInteger(Number(change)) && change !== ""
                          ? Math.max(0, onHand + Number(change))
                          : "?"}
                      </span>
                    ) : (
                      onHand
                    )}
                  </td>
                  {inventory && <td className="p-3 text-muted-foreground">{level?.in_transit ?? 0}</td>}
                  {inventory && <td className="p-3 text-muted-foreground">{level?.committed ?? 0}</td>}
                  {inventory && <td className="p-3 text-foreground">{product.stock}</td>}
                  <td className="p-3 text-right whitespace-nowrap">
                    {canManageProducts &&
                      (editing ? (
                        <div className="flex items-center justify-end gap-2">
                          <Input
                            autoFocus
                            inputMode="numeric"
                            placeholder="+5 / -2"
                            value={change}
                            onChange={(e) => setChange(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && submit(product)}
                            className="h-8 w-24"
                          />
                          <Select value={reason} onValueChange={setReason}>
                            <SelectTrigger className="h-8 w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="correction">Correction</SelectItem>
                              <SelectItem value="received">Received</SelectItem>
                              <SelectItem value="damaged">Damaged</SelectItem>
                              <SelectItem value="returned">Returned</SelectItem>
                              <SelectItem value="stock_count">Stock count</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" disabled={adjust.isPending} onClick={() => submit(product)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(product.id);
                            setChange("");
                          }}
                        >
                          Adjust
                        </Button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminInventory;
