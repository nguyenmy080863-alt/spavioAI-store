import { useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import Header from "../components/header/Header";
import Footer from "../components/footer/Footer";
import CategoryHeader from "../components/category/CategoryHeader";
import FilterSortBar from "../components/category/FilterSortBar";
import ProductGrid from "../components/category/ProductGrid";
import { COLLECTIONS, slugToCategory } from "@/data/products";
import { useProductText } from "@/i18n/useProductText";
import { useLocale } from "@/i18n/LocaleLink";
import { absoluteUrl } from "../components/SEO";
import NotFound from "./NotFound";
import { useCollections, useStorefrontProducts } from "@/hooks/useCatalog";
import { useTranslation } from "react-i18next";
import SEO from "../components/SEO";

const Category = () => {
  const { t } = useTranslation("shop");
  const { t: tSeo } = useTranslation("seo");
  const lang = useLocale();
  const { localize, categoryLabel } = useProductText();
  const { category } = useParams();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") || "";

  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filter & Sort State
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPriceRanges, setSelectedPriceRanges] = useState<string[]>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("featured");

  const { data: products = [], isLoading } = useStorefrontProducts();
  const { data: collections = [], isLoading: collectionsLoading } = useCollections();
  const dbCollection = collections.find((entry) => entry.slug === category);

  // Determine base products from route parameter
  const categoryName = slugToCategory(category || "shop");

  const localizedProducts = useMemo(() => products.map(localize), [products, localize]);

  const filteredItems = useMemo(() => {
    let items = localizedProducts;

    // Search query parameter filtering
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.effect && p.effect.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    } else {
      // Route category filtering, or a curated collection (new-in, sale, ...)
      if (categoryName) {
        items = localizedProducts.filter((p) => p.category === categoryName);
      } else if (dbCollection) {
        // Hand-picked collection from the admin panel, in the order set there.
        items = dbCollection.productSlugs.flatMap((slug) => localizedProducts.filter((p) => p.id === slug));
      } else if (category && COLLECTIONS[category]) {
        items = localizedProducts.filter(COLLECTIONS[category]);
      }
    }

    // 1. Filter by Category Checkboxes (if selected in drawer)
    if (selectedCategories.length > 0) {
      items = items.filter((p) => selectedCategories.includes(p.category));
    }

    // 2. Filter by Price Ranges
    if (selectedPriceRanges.length > 0) {
      items = items.filter((p) => {
        const price = p.salePrice ?? p.price;
        return selectedPriceRanges.some((range) => {
          if (range === "Under €100") return price < 100;
          if (range === "€100 - €200") return price >= 100 && price <= 200;
          if (range === "€200+") return price > 200;
          return true;
        });
      });
    }

    // 3. Filter by Style / Features
    if (selectedStyles.length > 0) {
      items = items.filter((p) => {
        const effectText = (p.effect || "").toLowerCase();
        const descText = (p.description || "").toLowerCase();
        const nameText = (p.name || "").toLowerCase();

        return selectedStyles.some((style) => {
          const s = style.toLowerCase();
          return (
            effectText.includes(s) ||
            descText.includes(s) ||
            nameText.includes(s)
          );
        });
      });
    }

    // 4. Apply Sorting
    return [...items].sort((a, b) => {
      const priceA = a.salePrice ?? a.price;
      const priceB = b.salePrice ?? b.price;

      if (sortBy === "price-low") return priceA - priceB;
      if (sortBy === "price-high") return priceB - priceA;
      if (sortBy === "newest") return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return 0; // "featured" keeps original order
    });
  }, [
    localizedProducts,
    searchQuery,
    categoryName,
    category,
    dbCollection,
    selectedCategories,
    selectedPriceRanges,
    selectedStyles,
    sortBy,
  ]);

  const handleClearAll = () => {
    setSelectedCategories([]);
    setSelectedPriceRanges([]);
    setSelectedStyles([]);
    setSortBy("featured");
  };

  const slug = category ?? "shop";
  const isKnownPage = slug === "shop" || Boolean(categoryName) || Boolean(dbCollection) || Boolean(COLLECTIONS[slug]);
  const isSearch = Boolean(searchQuery.trim());

  const title = isSearch
    ? t("category.searchResults", { query: searchQuery })
    : categoryName
      ? categoryLabel(categoryName)
      : dbCollection
        ? dbCollection.titles[lang] || t(`category.collections.${slug}`, { defaultValue: dbCollection.titles.en || slug })
        : COLLECTIONS[slug]
        ? t(`category.collections.${slug}`)
        : t("category.allProducts");

  const pagePath = `/category/${slug}`;
  const seoTitle = isSearch
    ? tSeo("search.title", { query: searchQuery })
    : slug === "shop"
      ? tSeo("shop.title")
      : tSeo("category.title", { name: title });
  const seoDescription = isSearch
    ? tSeo("search.description", { query: searchQuery })
    : slug === "shop"
      ? tSeo("shop.description")
      : tSeo("category.description", { name: title });

  const collectionJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description: seoDescription,
      url: absoluteUrl(pagePath, lang),
      inLanguage: lang,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: filteredItems.length,
        itemListElement: filteredItems.map((p, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: absoluteUrl(`/product/${p.id}`, lang),
          name: p.name,
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: t("category.home"), item: absoluteUrl("/", lang) },
        { "@type": "ListItem", position: 2, name: title, item: absoluteUrl(pagePath, lang) },
      ],
    },
  ];

  if (!isKnownPage && !isSearch) return collectionsLoading ? null : <NotFound />;

  return (
    <div className="min-h-screen bg-background font-sans">
      <SEO
        title={seoTitle}
        description={seoDescription}
        canonical={isSearch ? undefined : pagePath}
        noindex={isSearch}
        jsonLd={isSearch ? undefined : collectionJsonLd}
      />
      <Header />

      <main className="pt-6">
        <CategoryHeader category={title} />

        <FilterSortBar
          filtersOpen={filtersOpen}
          setFiltersOpen={setFiltersOpen}
          itemCount={filteredItems.length}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
          selectedPriceRanges={selectedPriceRanges}
          setSelectedPriceRanges={setSelectedPriceRanges}
          selectedStyles={selectedStyles}
          setSelectedStyles={setSelectedStyles}
          sortBy={sortBy}
          setSortBy={setSortBy}
          onClearAll={handleClearAll}
        />

        {isLoading ? (
          <p className="px-6 pb-16 text-sm text-muted-foreground">
            {t("category.loading")}
          </p>
        ) : (
          <ProductGrid items={filteredItems} />
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Category;
