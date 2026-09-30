import { useState } from "react";
import { Link } from "@/i18n/LocaleLink";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { Minus, Plus } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { categoryToSlug, formatPrice, type Product } from "@/data/products";
import { useTranslation } from "react-i18next";
import FomoCountdown from "@/components/fomo/FomoCountdown";
import PricingDisplay from "@/components/PricingDisplay";
import { useProductText } from "@/i18n/useProductText";
import PreorderNotice from "./PreorderNotice";
import { depositPerUnit } from "@/lib/preorder";

interface ProductInfoProps {
  product: Product;
}

const ProductInfo = ({ product: rawProduct }: ProductInfoProps) => {
  const { t } = useTranslation("shop");
  const { localize } = useProductText();
  const product = localize(rawProduct);
  const [quantity, setQuantity] = useState(1);
  const { addItem, openBag } = useCart();

  const incrementQuantity = () => setQuantity(prev => prev + 1);
  const decrementQuantity = () => setQuantity(prev => Math.max(1, prev - 1));

  const handleAddToBag = () => {
    addItem(rawProduct, quantity);
    openBag();
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb - Show only on desktop */}
      <div className="hidden lg:block">
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
                <Link to={`/category/${categoryToSlug(product.category)}`}>{product.categoryLabel}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{product.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Product title and price */}
      <div className="space-y-2">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent mb-2">{product.categoryLabel}</p>
            <h1 className="text-2xl md:text-3xl font-light text-foreground">{product.name}</h1>
          </div>
          <div className="text-right">
            <PricingDisplay price={product.price} salePrice={product.salePrice} size="lg" className="justify-end" />
          </div>
        </div>
      </div>

      <FomoCountdown slug={(product as Product & { slug?: string }).slug ?? product.id} basePrice={product.price} />

      <PreorderNotice product={rawProduct} />

      {/* Product details */}
      <div className="space-y-4 py-4 border-b border-border">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{t("productInfo.effect")}</h3>
          <p className="text-sm font-light text-muted-foreground">{product.effect}</p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{t("productInfo.warranty")}</h3>
          <p className="text-sm font-light text-muted-foreground">{t("productInfo.warrantyDescription")}</p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{t("productInfo.inTheBox")}</h3>
          <p className="text-sm font-light text-muted-foreground">{t("productInfo.inTheBoxDescription")}</p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{t("productInfo.editorsNotes")}</h3>
          <p className="text-sm font-light text-muted-foreground italic">{product.editorsNotes}</p>
        </div>
      </div>

      {/* Quantity and Add to Cart */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-light text-foreground">{t("productInfo.quantity")}</span>
          <div className="flex items-center border border-border rounded-full overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={decrementQuantity}
              className="h-10 w-10 p-0 hover:bg-transparent hover:opacity-50 rounded-none border-none"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="h-10 flex items-center px-4 text-sm font-light min-w-12 justify-center border-l border-r border-border">
              {quantity}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={incrementQuantity}
              className="h-10 w-10 p-0 hover:bg-transparent hover:opacity-50 rounded-none border-none"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Button
          onClick={handleAddToBag}
          className="w-full h-12 rounded-full bg-brand-gradient text-white font-semibold tracking-wide shadow-glow hover:brightness-110 transition-[filter]"
        >
          {rawProduct.preorder
            ? t("preorder.cta", {
                deposit: formatPrice(depositPerUnit(rawProduct.salePrice ?? rawProduct.price, rawProduct.preorder)),
              })
            : t("productInfo.addToBag")}
        </Button>
      </div>
    </div>
  );
};

export default ProductInfo;
