import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchPreviewProducts } from "@/lib/catalog";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Link } from "@/i18n/LocaleLink";
import Header from "../components/header/Header";
import Footer from "../components/footer/Footer";
import ProductImageGallery from "../components/product/ProductImageGallery";
import ProductInfo from "../components/product/ProductInfo";
import ProductDescription from "../components/product/ProductDescription";
import ProductCarousel from "../components/content/ProductCarousel";
import NotFound from "./NotFound";
import { useStorefrontProduct } from "@/hooks/useCatalog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { useTranslation } from "react-i18next";
import SEO, { SITE_URL, absoluteUrl } from "../components/SEO";
import { LOCAL_ASSETS, categoryToSlug } from "@/data/products";
import { useLocale } from "@/i18n/LocaleLink";
import { useProductText } from "@/i18n/useProductText";
import { articlesForProduct } from "@/data/journal";
import ArticleCard from "@/components/journal/ArticleCard";

const ProductDetail = () => {
  const { t } = useTranslation("shop");
  const { t: tSeo } = useTranslation("seo");
  const { t: tJournal } = useTranslation("journal");
  const lang = useLocale();
  const { localize } = useProductText();
  const { productId } = useParams();
  const { product: liveProduct, data: products = [], isLoading: liveLoading } = useStorefrontProduct(productId);

  // Team members can open a draft with ?preview=1 (customers never see unpublished products).
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAdminAuth();
  const previewing = searchParams.get("preview") === "1" && isAdmin && !liveProduct;
  const { data: previewProducts, isLoading: previewLoading } = useQuery({
    queryKey: ["preview-products"],
    queryFn: fetchPreviewProducts,
    enabled: previewing,
  });
  const product = liveProduct ?? (previewing ? previewProducts?.find((p) => p.slug === productId) : undefined);
  const isLoading = liveLoading || (previewing && previewLoading);
  const isPreview = !liveProduct && !!product;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-6 px-6">
          <p className="text-sm text-muted-foreground">{t("productDetail.loading")}</p>
        </main>
      </div>
    );
  }

  if (!product) {
    return <NotFound />;
  }

  const galleryImages =
    product.images && product.images.length > 0
      ? product.images
      : [product.image];
  const related = products.filter((p) => p.id !== product.id).slice(0, 6);
  const sameCategory = products
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, 4);

  const text = localize(product);
  const guides = articlesForProduct(product.id).slice(0, 3);
  const categoryPath = `/category/${categoryToSlug(product.category)}`;
  const productPath = `/product/${product.id}`;
  const toAbsolute = (src: string) => (src.startsWith("http") ? src : `${SITE_URL}${src.startsWith("/") ? "" : "/"}${src}`);
  // Social networks can't render SVG, so bundled products use prerendered JPG share images.
  const productOgImage = LOCAL_ASSETS[product.id] ? `${SITE_URL}/og/products/${product.id}.jpg` : toAbsolute(product.image);
  const productPrice = product.salePrice ?? product.price;
  const inStock = product.stock === undefined || product.stock > 0;
  const productJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: text.name,
      description: text.description,
      sku: product.id,
      category: text.categoryLabel,
      image: [productOgImage, ...galleryImages.map(toAbsolute)],
      brand: { "@type": "Brand", name: "Spavio AI" },
      url: absoluteUrl(productPath, lang),
      inLanguage: lang,
      offers: {
        "@type": "Offer",
        priceCurrency: "EUR",
        price: productPrice.toFixed(2),
        availability: product.preorder
          ? "https://schema.org/PreOrder"
          : inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        ...(product.preorder?.releaseDate ? { availabilityStarts: product.preorder.releaseDate } : {}),
        itemCondition: "https://schema.org/NewCondition",
        url: absoluteUrl(productPath, lang),
        seller: { "@type": "Organization", name: "Spavio AI Store" },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: t("productDetail.home"), item: absoluteUrl("/", lang) },
        { "@type": "ListItem", position: 2, name: text.categoryLabel, item: absoluteUrl(categoryPath, lang) },
        { "@type": "ListItem", position: 3, name: text.name, item: absoluteUrl(productPath, lang) },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={tSeo("product.title", { name: text.name, effect: text.effect })}
        description={tSeo("product.description", { description: text.description })}
        canonical={productPath}
        ogImage={productOgImage}
        ogType="product"
        jsonLd={productJsonLd}
        noindex={isPreview}
      />
      <Header />
      {isPreview && (
        <p className="bg-amber-500/10 text-amber-700 text-xs text-center py-2 px-6">
          Preview: this product is not published, so customers cannot see it.
        </p>
      )}


      <main className="pt-6">
        <section className="w-full px-6">
          {/* Breadcrumb - Show above image on smaller screens */}
          <div className="lg:hidden mb-6">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/">{t("productDetail.home")}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={categoryPath}>{text.categoryLabel}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{text.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            <ProductImageGallery images={galleryImages} productName={text.name} />

            <div className="lg:pl-12 mt-8 lg:mt-0 lg:sticky lg:top-6 lg:h-fit">
              <ProductInfo product={product} />
              <ProductDescription product={product} />
            </div>
          </div>
        </section>

        {guides.length > 0 && (
          <section className="w-full mt-16 lg:mt-24 px-6">
            <h2 className="mb-4 text-sm font-light text-foreground">{tJournal("article.relatedGuides")}</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {guides.map((guide) => (
                <ArticleCard key={guide.slug} article={guide} />
              ))}
            </div>
          </section>
        )}

        <section className="w-full mt-16 lg:mt-24">
          <div className="mb-4 px-6">
            <h2 className="text-sm font-light text-foreground">{t("productDetail.youMightAlsoLike")}</h2>
          </div>
          <ProductCarousel items={related} />
        </section>

        {sameCategory.length > 0 && (
          <section className="w-full">
            <div className="mb-4 px-6">
              <h2 className="text-sm font-light text-foreground">{t("productDetail.moreFrom", { category: text.categoryLabel })}</h2>
            </div>
            <ProductCarousel items={sameCategory} />
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default ProductDetail;
