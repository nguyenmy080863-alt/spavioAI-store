import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/LocaleLink";
import Pagination from "./Pagination";
import { type Product } from "@/data/products";
import PricingDisplay from "@/components/PricingDisplay";
import { useStorefrontProducts } from "@/hooks/useCatalog";
import { useTranslation } from "react-i18next";
import { useProductText } from "@/i18n/useProductText";

interface ProductGridProps {
  items?: Product[];
}

const ProductGrid = ({ items }: ProductGridProps) => {
  const { data: fetched = [] } = useStorefrontProducts();
  return <ProductGridView items={items ?? fetched} />;
};

const ProductGridView = ({ items }: { items: Product[] }) => {
  const { t } = useTranslation("shop");
  const { localize } = useProductText();
  return (
    <section className="w-full px-6 mb-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {items.map(localize).map((product) => {
            const extended = product as { images?: string[]; hoverImageEnabled?: boolean };
            const hoverImage = extended.hoverImageEnabled === false ? undefined : extended.images?.[1];
            return (
            <Link key={product.id} to={`/product/${product.id}`}>
              <Card
                className="border-none shadow-none bg-transparent group cursor-pointer"
              >
                <CardContent className="p-0">
                  <div className="aspect-[4/5] mb-3 overflow-hidden bg-secondary rounded-2xl relative">
                    <img
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                      width={1024}
                      height={1024}
                      className={`w-full h-full object-cover transition-all duration-300 ${hoverImage ? "group-hover:opacity-0" : ""}`}
                    />
                    {hoverImage && (
                      <img
                        src={hoverImage}
                        alt={t("productGrid.alternateView", { name: product.name })}
                        loading="lazy"
                        width={1024}
                        height={1024}
                        className="absolute inset-0 w-full h-full object-cover transition-all duration-300 opacity-0 group-hover:opacity-100"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/[0.03]"></div>
                    {product.preorder ? (
                      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-foreground text-[9px] uppercase tracking-[0.2em] font-semibold text-background shadow-glow">
                        {t("preorder.badge")}
                      </div>
                    ) : product.isNew && (
                      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-brand-gradient text-[9px] tracking-[0.2em] font-semibold text-white shadow-glow">
                        {t("productGrid.new")}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-light text-foreground">
                      {product.categoryLabel}
                    </p>
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-medium text-foreground">
                        {product.name}
                      </h3>
                      <PricingDisplay price={product.price} salePrice={product.salePrice} size="sm" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            );
          })}

        </div>

      <Pagination />
    </section>
  );
};

export default ProductGrid;
