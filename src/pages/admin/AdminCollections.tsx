import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAdminProducts } from "@/lib/catalog";
import { CATEGORIES, categoryToSlug } from "@/data/products";
import { db, run } from "@/lib/orders";
import { logAudit } from "@/lib/audit";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESERVED = ["shop", "new-in", "sale", "under-100", ...CATEGORIES.map(categoryToSlug)];

interface CollectionRow {
  id: string;
  slug: string;
  title_de: string;
  title_en: string;
  title_vi: string;
  active: boolean;
  collection_products: { position: number; product_id: string }[];
}

const fetchCollections = async (): Promise<CollectionRow[]> => {
  const { data, error } = await db
    .from("collections")
    .select("id, slug, title_de, title_en, title_vi, active, collection_products(position, product_id)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data as CollectionRow[];
};

interface EditorProps {
  initial: CollectionRow | null;
  onClose: () => void;
}

/** Create or edit a hand-picked collection: titles per language and an ordered list of products. */
const CollectionEditor = ({ initial, onClose }: EditorProps) => {
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ["admin-products"], queryFn: fetchAdminProducts });

  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [titles, setTitles] = useState({
    de: initial?.title_de ?? "",
    en: initial?.title_en ?? "",
    vi: initial?.title_vi ?? "",
  });
  const [active, setActive] = useState(initial?.active ?? true);
  const [members, setMembers] = useState<string[]>(
    (initial?.collection_products ?? []).slice().sort((a, b) => a.position - b.position).map((entry) => entry.product_id),
  );
  const [search, setSearch] = useState("");

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const addable = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter((p) => !p.archived_at && !members.includes(p.id) && (p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)))
      .slice(0, 6);
  }, [products, members, search]);

  const move = (index: number, delta: number) =>
    setMembers((current) => {
      const next = current.slice();
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = useMutation({
    mutationFn: async () => {
      const cleanSlug = slug.trim().toLowerCase();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cleanSlug)) throw new Error("The address may only use lowercase letters, numbers and hyphens");
      if (!initial && RESERVED.includes(cleanSlug)) throw new Error("This address is reserved for a built-in page. Choose another.");
      if (!titles.en.trim() && !titles.de.trim() && !titles.vi.trim()) throw new Error("Give the collection a title in at least one language");

      let id = initial?.id;
      const values = { title_de: titles.de.trim(), title_en: titles.en.trim(), title_vi: titles.vi.trim(), active };
      if (initial) {
        await run(db.from("collections").update(values).eq("id", initial.id));
      } else {
        const { data, error } = await db.from("collections").insert({ slug: cleanSlug, ...values }).select("id").single();
        if (error) throw new Error(error.code === "23505" ? "A collection with this address already exists" : error.message);
        id = data.id as string;
      }

      // Write the new list first, then remove what was taken out.
      if (members.length > 0) {
        await run(
          db.from("collection_products").upsert(
            members.map((product_id, position) => ({ collection_id: id, product_id, position })),
            { onConflict: "collection_id,product_id" },
          ),
        );
      }
      const removed = (initial?.collection_products ?? []).map((entry) => entry.product_id).filter((pid) => !members.includes(pid));
      if (removed.length > 0) {
        await run(db.from("collection_products").delete().eq("collection_id", id).in("product_id", removed));
      }
      await logAudit(initial ? "update" : "create", "collection", id ?? null, { slug: cleanSlug, products: members.length });
    },
    onSuccess: () => {
      toast.success("Collection saved");
      void queryClient.invalidateQueries({ queryKey: ["admin-collections"] });
      void queryClient.invalidateQueries({ queryKey: ["storefront-collections"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await run(db.from("collections").delete().eq("id", initial!.id));
      await logAudit("delete", "collection", initial!.id, { slug: initial!.slug });
    },
    onSuccess: () => {
      toast.success("Collection deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin-collections"] });
      void queryClient.invalidateQueries({ queryKey: ["storefront-collections"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="border border-border p-5 space-y-5">
      <h2 className="text-sm font-medium text-foreground">{initial ? `Edit ${initial.slug}` : "New collection"}</h2>

      <div className="space-y-1.5 max-w-sm">
        <Label htmlFor="c-slug">Address</Label>
        <Input id="c-slug" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!initial} maxLength={60} placeholder="gifts-for-her" />
        <p className="text-xs text-muted-foreground">
          The page will be at /category/{slug || "…"}. It cannot be changed later.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {([["de", "Title (Deutsch)"], ["en", "Title (English)"], ["vi", "Title (Tiếng Việt)"]] as const).map(([lang, label]) => (
          <div key={lang} className="space-y-1.5">
            <Label htmlFor={`c-title-${lang}`}>{label}</Label>
            <Input id={`c-title-${lang}`} value={titles[lang]} onChange={(e) => setTitles((t) => ({ ...t, [lang]: e.target.value }))} maxLength={80} />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground -mt-3">An empty title falls back to the translation in code, then to English.</p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Visible in the shop
      </label>

      <div className="space-y-2">
        <Label>Products ({members.length}), in display order</Label>
        <ul className="border border-border divide-y divide-border text-sm">
          {members.length === 0 && <li className="p-3 text-muted-foreground">No products yet.</li>}
          {members.map((id, index) => {
            const product = byId.get(id);
            return (
              <li key={id} className="flex items-center justify-between gap-3 p-2">
                <span>
                  {product?.name ?? "Unknown product"}
                  {product && product.status !== "published" && <span className="text-xs text-amber-700"> (not published, hidden in the shop)</span>}
                </span>
                <span className="flex gap-2 text-xs">
                  <button type="button" className="text-muted-foreground" onClick={() => move(index, -1)} aria-label="Move up">Up</button>
                  <button type="button" className="text-muted-foreground" onClick={() => move(index, 1)} aria-label="Move down">Down</button>
                  <button type="button" className="text-destructive" onClick={() => setMembers((c) => c.filter((x) => x !== id))}>Remove</button>
                </span>
              </li>
            );
          })}
        </ul>
        <Input placeholder="Add a product: search by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        {addable.length > 0 && (
          <ul className="border border-border divide-y divide-border text-sm max-w-sm">
            {addable.map((p) => (
              <li key={p.id}>
                <button type="button" className="w-full text-left p-2 hover:bg-muted" onClick={() => { setMembers((c) => [...c, p.id]); setSearch(""); }}>
                  {p.name} <span className="text-xs text-muted-foreground">{p.sku}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          Save collection
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {initial && (
          <Button
            size="sm"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm("Delete this collection? The products stay.")) remove.mutate();
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
};

const AdminCollections = () => {
  const { canManageProducts } = useAdminAuth();
  const [editing, setEditing] = useState<CollectionRow | "new" | null>(null);

  const { data: products = [] } = useQuery({ queryKey: ["admin-products"], queryFn: fetchAdminProducts });
  const { data: collections = [], isLoading, error } = useQuery({
    queryKey: ["admin-collections"],
    queryFn: fetchCollections,
    retry: false,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Collections</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hand-picked lists of products, each with its own page in the shop at /category/&lt;address&gt;.
          </p>
        </div>
        {canManageProducts && !editing && (
          <Button size="sm" onClick={() => setEditing("new")}>
            Add collection
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error.message}. Has migration 0023 been applied in Supabase?</p>}

      {editing && (
        <CollectionEditor key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Your collections</h2>
        <div className="border border-border divide-y divide-border text-sm">
          {isLoading && <p className="p-4 text-muted-foreground">Loading…</p>}
          {!isLoading && collections.length === 0 && <p className="p-4 text-muted-foreground">No collections yet.</p>}
          {collections.map((collection) => (
            <div key={collection.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span>
                <Link to={`/category/${collection.slug}`} target="_blank" className="text-foreground">
                  {collection.title_en || collection.title_de || collection.slug}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  /category/{collection.slug} · {collection.collection_products.length} product(s) ·{" "}
                  {collection.active ? "Visible" : "Hidden"}
                </span>
              </span>
              {canManageProducts && (
                <Button size="sm" variant="outline" onClick={() => setEditing(collection)}>
                  Edit
                </Button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          These pages are rendered in the browser and are not part of the pre-built sitemap yet. Link to them from
          emails, journal articles, discounts or the shop menu (menu links are set in the code).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Built-in pages</h2>
        <div className="border border-border divide-y divide-border text-sm">
          {CATEGORIES.map((category) => (
            <div key={category} className="flex justify-between gap-3 p-3">
              <Link to={`/category/${categoryToSlug(category)}`} target="_blank" className="text-foreground">
                {category}
              </Link>
              <span className="text-muted-foreground">
                Category · {products.filter((p) => p.category === category && !p.archived_at).length} product(s)
              </span>
            </div>
          ))}
          {[
            ["new-in", "New in", "Products marked as new"],
            ["sale", "Sale", "Products with a sale price"],
            ["under-100", "Under €100", "Price below €100"],
          ].map(([slug, title, rule]) => (
            <div key={slug} className="flex justify-between gap-3 p-3">
              <Link to={`/category/${slug}`} target="_blank" className="text-foreground">
                {title}
              </Link>
              <span className="text-muted-foreground">Automatic · {rule}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminCollections;
