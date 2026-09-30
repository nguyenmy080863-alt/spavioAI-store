import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { fetchAdminProduct, resolveImages, slugify } from "@/lib/catalog";
import { CATEGORIES, formatPrice } from "@/data/products";
import { depositPerUnit, validatePreorder, type DepositType } from "@/lib/preorder";
import { logAudit } from "@/lib/audit";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ProductImageUploader, { type DraftImage } from "@/components/admin/ProductImageUploader";

const schema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  sku: z
    .string()
    .trim()
    .min(2, "SKU is required")
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "SKU may contain letters, numbers and dashes only"),
  category: z.string().trim().min(2, "Category is required").max(60),
  effect: z.string().trim().max(60),
  description: z.string().trim().max(4000),
  editorsNotes: z.string().trim().max(1000),
  price: z.number().nonnegative("Price cannot be negative").max(100000),
  salePrice: z.number().nonnegative("Sale price cannot be negative").max(100000).nullable(),
  stock: z.number().int("Stock must be a whole number").nonnegative("Stock cannot be negative"),
  lowStockThreshold: z.number().int().nonnegative().max(10000),
});

const emptyForm = {
  name: "",
  sku: "",
  category: CATEGORIES[0] as string,
  effect: "",
  description: "",
  editorsNotes: "",
  price: "0",
  salePrice: "",
  stock: "0",
  lowStockThreshold: "5",
  isNew: false,
  status: "draft",
  hoverImageEnabled: true,
  preorderEnabled: false,
  preorderDepositType: "fixed" as DepositType,
  preorderDepositValue: "",
  preorderReleaseDate: "",
};

const AdminProductForm = () => {
  const { productId } = useParams();
  const isNewProduct = !productId || productId === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canManageProducts } = useAdminAuth();

  const [form, setForm] = useState(emptyForm);
  const [images, setImages] = useState<DraftImage[]>([]);

  const { data: product, isLoading } = useQuery({
    queryKey: ["admin-product", productId],
    queryFn: () => fetchAdminProduct(productId as string),
    enabled: !isNewProduct,
  });

  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      effect: product.effect ?? "",
      description: product.description ?? "",
      editorsNotes: product.editors_notes ?? "",
      price: String(product.price),
      salePrice: product.sale_price === null ? "" : String(product.sale_price),
      stock: String(product.stock),
      lowStockThreshold: String(product.low_stock_threshold),
      isNew: product.is_new,
      status: product.status,
      hoverImageEnabled: product.hover_image_enabled !== false,
      preorderEnabled: product.preorder_enabled === true,
      preorderDepositType: product.preorder_deposit_type === "percent" ? "percent" : "fixed",
      preorderDepositValue: product.preorder_enabled ? String(product.preorder_deposit_value) : "",
      preorderReleaseDate: product.preorder_release_date ?? "",
    });
    void (async () => {
      const urls = await resolveImages([product]);
      const resolved = urls.get(product.id) ?? [];
      setImages(
        (product.product_images ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((img, index) => ({
            id: img.id,
            previewUrl: resolved[index] ?? "",
            storagePath: img.storage_path,
            assetKey: img.asset_key,
            url: img.url,
          })),
      );
    })();
  }, [product]);

  const slug = useMemo(() => slugify(form.name), [form.name]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({
        name: form.name,
        sku: form.sku,
        category: form.category,
        effect: form.effect,
        description: form.description,
        editorsNotes: form.editorsNotes,
        price: Number(form.price),
        salePrice: form.salePrice === "" ? null : Number(form.salePrice),
        stock: Number(form.stock),
        lowStockThreshold: Number(form.lowStockThreshold),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const values = parsed.data;
      if (values.salePrice !== null && values.salePrice >= values.price) {
        throw new Error("Sale price must be lower than the regular price");
      }
      const preorder = {
        depositType: form.preorderDepositType,
        depositValue: Number(form.preorderDepositValue),
        releaseDate: form.preorderReleaseDate || null,
      };
      if (form.preorderEnabled) {
        const preorderError = validatePreorder(preorder, values.salePrice ?? values.price);
        if (preorderError) throw new Error(preorderError);
      }

      const payload = {
        name: values.name,
        slug: slug || slugify(values.sku),
        sku: values.sku.toUpperCase(),
        category: values.category,
        effect: values.effect,
        description: values.description,
        editors_notes: values.editorsNotes,
        price: values.price,
        sale_price: values.salePrice,
        stock: values.stock,
        low_stock_threshold: values.lowStockThreshold,
        is_new: form.isNew,
        status: form.status,
        hover_image_enabled: form.hoverImageEnabled,
        preorder_enabled: form.preorderEnabled,
        preorder_deposit_type: preorder.depositType,
        preorder_deposit_value: form.preorderEnabled ? preorder.depositValue : 0,
        preorder_release_date: form.preorderEnabled ? preorder.releaseDate : null,
        updated_at: new Date().toISOString(),
      };

      let id = productId as string;
      if (isNewProduct) {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await supabase.from("products").update(payload).eq("id", id);
        if (error) throw error;
      }

      // Replace the image set with the current draft order.
      const { error: deleteError } = await supabase.from("product_images").delete().eq("product_id", id);
      if (deleteError) throw deleteError;
      if (images.length > 0) {
        const { error: insertError } = await supabase.from("product_images").insert(
          images.map((image, index) => ({
            product_id: id,
            position: index,
            storage_path: image.storagePath ?? null,
            asset_key: image.assetKey ?? null,
            url: image.url ?? null,
          })),
        );
        if (insertError) throw insertError;
      }

      await logAudit(isNewProduct ? "create" : "update", "product", id, {
        name: values.name,
        price: values.price,
        sale_price: values.salePrice,
        stock: values.stock,
        status: form.status,
        preorder: form.preorderEnabled
          ? { deposit_type: preorder.depositType, deposit_value: preorder.depositValue, release_date: preorder.releaseDate }
          : false,
      });
      return id;
    },
    onSuccess: () => {
      toast.success(isNewProduct ? "Product created" : "Product updated");
      void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      void queryClient.invalidateQueries({ queryKey: ["storefront-products"] });
      navigate("/admin/products");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canManageProducts) {
    return <p className="text-sm text-muted-foreground">You do not have permission to edit products.</p>;
  }

  if (!isNewProduct && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading product…</p>;
  }

  const effectivePrice = form.salePrice !== "" ? Number(form.salePrice) : Number(form.price);
  const previewDeposit =
    form.preorderEnabled && Number(form.preorderDepositValue) > 0 && effectivePrice > 0
      ? depositPerUnit(effectivePrice, {
          depositType: form.preorderDepositType,
          depositValue: Number(form.preorderDepositValue),
          releaseDate: null,
        })
      : null;

  const field = (key: keyof typeof emptyForm) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <form
      className="space-y-10 max-w-3xl"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-light text-foreground">
            {isNewProduct ? "New product" : form.name || "Edit product"}
          </h1>
          {!isNewProduct && (
            <p className="text-sm text-muted-foreground mt-1">Storefront URL: /product/{slug}</p>
          )}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/products">Back</Link>
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="name">Title</Label>
          <Input id="name" maxLength={120} required {...field("name")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" maxLength={40} required {...field("sku")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            value={form.category}
            onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
          >
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="effect">Effect / style tag</Label>
          <Input id="effect" maxLength={60} {...field("effect")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Price (EUR)</Label>
          <Input id="price" type="number" min="0" step="0.01" required {...field("price")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="salePrice">Sale price (optional)</Label>
          <Input id="salePrice" type="number" min="0" step="0.01" {...field("salePrice")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stock">Stock quantity</Label>
          <Input id="stock" type="number" min="0" step="1" required {...field("stock")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lowStockThreshold">Low stock alert at</Label>
          <Input
            id="lowStockThreshold"
            type="number"
            min="0"
            step="1"
            {...field("lowStockThreshold")}
          />
        </div>
      </div>

      <section className="space-y-4 rounded-lg border border-border p-5" aria-labelledby="preorder-heading">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="preorder-heading" className="text-sm font-medium text-foreground">Preorder</h2>
            <p className="text-xs text-muted-foreground">
              Customers pay a deposit at checkout and the balance when the product ships.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="preorderEnabled"
              checked={form.preorderEnabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, preorderEnabled: checked }))}
            />
            <Label htmlFor="preorderEnabled">Available for preorder</Label>
          </div>
        </div>

        {form.preorderEnabled && (
          <>
            <div className="grid sm:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="preorderDepositType">Deposit type</Label>
                <Select
                  value={form.preorderDepositType}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, preorderDepositType: value as DepositType }))
                  }
                >
                  <SelectTrigger id="preorderDepositType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed amount (EUR)</SelectItem>
                    <SelectItem value="percent">Percentage of price</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="preorderDepositValue">
                  {form.preorderDepositType === "percent" ? "Deposit (%)" : "Deposit per unit (EUR)"}
                </Label>
                <Input
                  id="preorderDepositValue"
                  type="number"
                  min="0.01"
                  max={form.preorderDepositType === "percent" ? "100" : undefined}
                  step={form.preorderDepositType === "percent" ? "1" : "0.01"}
                  required
                  {...field("preorderDepositValue")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preorderReleaseDate">Expected shipping date (optional)</Label>
                <Input id="preorderReleaseDate" type="date" {...field("preorderReleaseDate")} />
              </div>
            </div>
            {previewDeposit !== null && (
              <p className="text-sm text-muted-foreground">
                Customers pay <strong className="text-foreground">{formatPrice(previewDeposit)}</strong> per unit at
                checkout and <strong className="text-foreground">{formatPrice(Math.max(effectivePrice - previewDeposit, 0))}</strong>{" "}
                when it ships (price {formatPrice(effectivePrice)}).
              </p>
            )}
          </>
        )}
      </section>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={6} maxLength={4000} {...field("description")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="editorsNotes">Editor's notes</Label>
        <Textarea id="editorsNotes" rows={3} maxLength={1000} {...field("editorsNotes")} />
      </div>

      <div className="flex flex-wrap gap-8">
        <div className="flex items-center gap-3">
          <Switch
            id="isNew"
            checked={form.isNew}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isNew: checked }))}
          />
          <Label htmlFor="isNew">Show "New" badge</Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="status"
            checked={form.status === "published"}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, status: checked ? "published" : "draft" }))
            }
          />
          <Label htmlFor="status">Published on storefront</Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="hoverImageEnabled"
            checked={form.hoverImageEnabled}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, hoverImageEnabled: checked }))
            }
          />
          <Label htmlFor="hoverImageEnabled">Swap to second image on hover</Label>
        </div>
      </div>

      <div className="space-y-3">
        <Label>Media</Label>
        <ProductImageUploader
          productSlug={slug || "product"}
          images={images}
          onChange={setImages}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : isNewProduct ? "Create product" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate("/admin/products")}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

export default AdminProductForm;
