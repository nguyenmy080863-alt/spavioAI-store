import { useTranslation } from "react-i18next";
import { formatPrice } from "@/data/products";

/** A sale is only active when a sale price exists and is below the regular price. */
export const isOnSale = (price: number, salePrice?: number | null): salePrice is number =>
  salePrice != null && salePrice > 0 && salePrice < price;

/** The price the customer actually pays. */
export const effectivePrice = (price: number, salePrice?: number | null): number =>
  isOnSale(price, salePrice) ? salePrice : price;

export const discountPercent = (price: number, salePrice: number): number =>
  Math.round(((price - salePrice) / price) * 100);

interface PricingDisplayProps {
  /** Regular / RRP price. */
  price: number;
  salePrice?: number | null;
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
  className?: string;
}

const saleSizeClass: Record<string, string> = {
  sm: "text-sm font-medium text-foreground",
  md: "text-lg font-medium text-foreground",
  lg: "text-xl font-medium text-foreground",
};

const regularSizeClass: Record<string, string> = {
  sm: "text-xs font-light",
  md: "text-sm font-light",
  lg: "text-sm font-light",
};

const PricingDisplay = ({
  price,
  salePrice,
  size = "sm",
  showBadge = true,
  className = "",
}: PricingDisplayProps) => {
  const { t } = useTranslation("shop");

  if (!isOnSale(price, salePrice)) {
    return (
      <span className={`${saleSizeClass[size].replace("font-medium", "font-light")} ${className}`}>
        {formatPrice(price)}
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 ${className}`}>
      <span className={saleSizeClass[size]}>{formatPrice(salePrice)}</span>
      <span className={`${regularSizeClass[size]} text-muted-foreground line-through`}>
        {formatPrice(price)}
      </span>
      {showBadge && (
        <span className="bg-brand-gradient text-white text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-full">
          {t("pricing.off", { percent: discountPercent(price, salePrice) })}
        </span>
      )}
    </span>
  );
};

export default PricingDisplay;
