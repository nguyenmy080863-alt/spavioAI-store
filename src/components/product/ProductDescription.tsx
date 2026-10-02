import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/data/products";
import PricingDisplay from "@/components/PricingDisplay";
import { useTranslation } from "react-i18next";
import { useProductText } from "@/i18n/useProductText";

interface ProductDescriptionProps {
  product: Product;
}

const ProductDescription = ({ product: rawProduct }: ProductDescriptionProps) => {
  const { t } = useTranslation("shop");
  const { localize } = useProductText();
  const product = localize(rawProduct);
  const careSteps = t("productDescription.careSteps", { returnObjects: true }) as string[];
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(true);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isCareOpen, setIsCareOpen] = useState(false);

  return (
    <div className="space-y-0 mt-8 border-t border-border">
      {/* Description */}
      <div className="border-b border-border">
        <Button
          variant="ghost"
          onClick={() => setIsDescriptionOpen(!isDescriptionOpen)}
          className="w-full h-14 px-0 justify-between hover:bg-transparent font-light rounded-none"
        >
          <span>{t("productDescription.description")}</span>
          {isDescriptionOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
          <div hidden={!isDescriptionOpen} className="pb-6 space-y-4">
            <p className="text-sm font-light text-muted-foreground leading-relaxed">
              {product.description}
            </p>
            <p className="text-sm font-light text-muted-foreground leading-relaxed">
              {t("productDescription.descriptionExtra")}
            </p>
          </div>
      </div>

      {/* Product Details */}
      <div className="border-b border-border">
        <Button
          variant="ghost"
          onClick={() => setIsDetailsOpen(!isDetailsOpen)}
          className="w-full h-14 px-0 justify-between hover:bg-transparent font-light rounded-none"
        >
          <span>{t("productDescription.productDetails")}</span>
          {isDetailsOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
          <div hidden={!isDetailsOpen} className="pb-6 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm font-light text-muted-foreground">{t("productDescription.sku")}</span>
              <span className="text-sm font-light text-foreground">LL-{product.id.toUpperCase().slice(0, 3)}-001</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-light text-muted-foreground">{t("productDescription.collection")}</span>
              <span className="text-sm font-light text-foreground">{product.categoryLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-light text-muted-foreground">{t("productDescription.effect")}</span>
              <span className="text-sm font-light text-foreground">{product.effect}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-light text-muted-foreground">{t("productDescription.certified")}</span>
              <span className="text-sm font-light text-foreground">{t("productDescription.yes")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-light text-muted-foreground">{t("productDescription.price")}</span>
              <PricingDisplay price={product.price} salePrice={product.salePrice} size="sm" />
            </div>
          </div>
      </div>

      {/* Care Instructions */}
      <div className="border-b border-border lg:mb-16">
        <Button
          variant="ghost"
          onClick={() => setIsCareOpen(!isCareOpen)}
          className="w-full h-14 px-0 justify-between hover:bg-transparent font-light rounded-none"
        >
          <span>{t("productDescription.applicationAndCare")}</span>
          {isCareOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
          <div hidden={!isCareOpen} className="pb-6 space-y-4">
            <ul className="space-y-2">
              {careSteps.map((step) => (
                <li key={step} className="text-sm font-light text-muted-foreground">{step}</li>
              ))}
            </ul>
            <p className="text-sm font-light text-muted-foreground">
              {t("productDescription.careExtra")}
            </p>
          </div>
      </div>
    </div>
  );
};

export default ProductDescription;
