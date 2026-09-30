import { Link } from "@/i18n/LocaleLink";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import StoreLogo from "@/components/StoreLogo";

const CheckoutHeader = () => {
  const { t } = useTranslation("shop");
  return (
    <header className="w-full bg-background border-b border-muted-foreground/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="relative flex items-center justify-between">
          {/* Left side - Continue Shopping */}
          <Link 
            to="/" 
            className="flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="text-sm font-light hidden sm:inline">{t("checkoutHeader.continueShopping")}</span>
          </Link>

          {/* Center - Logo - Absolutely positioned to ensure perfect centering */}
          <Link to="/" className="absolute left-1/2 transform -translate-x-1/2">
            <StoreLogo heightClass="h-6 sm:h-7" badgeClassName="hidden min-[375px]:inline-block" alt={t("checkoutHeader.logoAlt")} />
          </Link>

          {/* Right side - Support */}
          <div className="text-xs sm:text-sm font-light text-foreground">
            {t("checkoutHeader.support")}
          </div>
        </div>
      </div>
    </header>
  );
};

export default CheckoutHeader;