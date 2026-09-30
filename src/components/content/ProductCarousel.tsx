import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/LocaleLink";
import { type Product } from "@/data/products";
import PricingDisplay from "@/components/PricingDisplay";
import { useStorefrontProducts } from "@/hooks/useCatalog";
import { useTranslation } from "react-i18next";
import { useProductText } from "@/i18n/useProductText";

interface ProductCarouselProps {
  items?: Product[];
}

const ProductCarousel = ({ items }: ProductCarouselProps) => {
  const { data: fetched = [] } = useStorefrontProducts();
  const list = items ?? fetched;
  return <ProductCarouselView items={list} />;
};

const ProductCarouselView = ({ items }: { items: Product[] }) => {
  const { t } = useTranslation("home");
  const { localize } = useProductText();
  return (
    <section className="w-full mb-16 px-6">
      <Carousel
          opts={{
            align: "start",
            loop: false,
          }}
          className="w-full"
        >
          <CarouselContent className="">
            {items.map(localize).map((product) => {
              const extended = product as { images?: string[]; hoverImageEnabled?: boolean };
              const hoverImage = extended.hoverImageEnabled === false ? undefined : extended.images?.[1];
              return (
               <CarouselItem
                 key={product.id}
                 className="basis-1/2 md:basis-1/3 lg:basis-1/4 pr-3 md:pr-5"
               >
                 <Link to={`/product/${product.id}`} className="block group">
                   <Card className="border-none shadow-none bg-transparent">
                     <CardContent className="p-0">
                       <div className="aspect-[4/5] mb-4 overflow-hidden bg-secondary rounded-2xl relative">
                         <img
                           src={product.image}
                           alt={product.name}
                           loading="lazy"
                           width={1024}
                           height={1024}
                           className={`w-full h-full object-cover transition-all duration-700 ease-out scale-100 group-hover:scale-105 ${
                             hoverImage ? "group-hover:opacity-0" : ""
                           }`}
                         />
                         {hoverImage && (
                           <img
                             src={hoverImage}
                             alt={t("productCarousel.styledAlt", { name: product.name })}
                             loading="lazy"
                             width={1024}
                             height={1024}
                             className="absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-out opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-105"
                           />
                         )}
                         <div className="absolute inset-0 bg-black/[0.02] group-hover:bg-black/0 transition-colors duration-300"></div>
                         
                         {/* Preorder badge takes priority over "new" */}
                         {product.preorder ? (
                           <div className="absolute top-3 right-3 bg-foreground text-background text-[8px] tracking-[0.2em] font-semibold uppercase px-2.5 py-1 rounded-full shadow-glow">
                             {t("shop:preorder.badge")}
                           </div>
                         ) : product.isNew && (
                           <div className="absolute top-3 right-3 bg-brand-gradient text-white text-[8px] tracking-[0.2em] font-semibold uppercase px-2.5 py-1 rounded-full shadow-glow">
                             {t("productCarousel.newBadge")}
                           </div>
                         )}

                         {/* Quick Shop slide up drawer bar */}
                         <div className="absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xs text-foreground text-[9px] tracking-[0.2em] uppercase py-3.5 text-center translate-y-full group-hover:translate-y-0 transition-transform duration-300 font-medium border-t border-accent/10">
                           {t("productCarousel.quickView")}
                         </div>
                       </div>
                      <div className="space-y-1.5 px-1">
                        <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-accent">
                          {product.categoryLabel}
                        </p>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1">
                          <h3 className="text-sm font-serif font-light text-foreground group-hover:text-accent transition-colors duration-300">
                            {product.name}
                          </h3>
                           <PricingDisplay price={product.price} salePrice={product.salePrice} size="sm" className="font-sans" />
                        </div>
                      </div>
                    </CardContent>
                   </Card>
                  </Link>
               </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
    </section>
  );
};

export default ProductCarousel;
