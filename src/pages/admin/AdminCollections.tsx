import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Search } from "lucide-react";
import { fetchAdminProducts } from "@/lib/catalog";
import { CATEGORIES, categoryToSlug } from "@/data/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Draft of the Collections page. Rows are derived from the fixed category list and
 * product counts; creating/editing collections needs a `collections` table (not built yet).
 */
const AdminCollections = () => {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: fetchAdminProducts,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return CATEGORIES.map((category) => ({
      slug: categoryToSlug(category),
      title: category,
      count: products.filter((p) => p.category === category && !p.archived_at).length,
      condition: `Product category is equal to ${category}`,
      channels: ["Online store"],
    })).filter((row) => !term || row.title.toLowerCase().includes(term));
  }, [products, search]);

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.slug));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Collections</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each collection becomes a section in the shop with all of its products.
          </p>
        </div>
        <Button size="sm" disabled title="Coming soon">
          Add collection
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search collections"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          maxLength={100}
        />
      </div>

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3 w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => setSelected(checked ? rows.map((r) => r.slug) : [])}
                  aria-label="Select all"
                />
              </th>
              <th className="p-3">Title</th>
              <th className="p-3">Products</th>
              <th className="p-3">Conditions</th>
              <th className="p-3">Sales channels</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  Loading collections…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No collections match your search.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.slug} className="border-b border-border last:border-0">
                <td className="p-3">
                  <Checkbox
                    checked={selected.includes(row.slug)}
                    onCheckedChange={(checked) =>
                      setSelected((prev) =>
                        checked ? [...prev, row.slug] : prev.filter((slug) => slug !== row.slug),
                      )
                    }
                    aria-label={`Select ${row.title}`}
                  />
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center border border-border bg-muted">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <Link to={`/category/${row.slug}`} className="text-foreground" target="_blank">
                      {row.title}
                    </Link>
                  </div>
                </td>
                <td className="p-3 text-muted-foreground">{row.count}</td>
                <td className="p-3 text-muted-foreground">{row.condition}</td>
                <td className="p-3 text-muted-foreground">{row.channels.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Collections group products so customers can browse them by theme.
      </p>
    </div>
  );
};

export default AdminCollections;
