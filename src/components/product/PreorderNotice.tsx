import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatPrice, type Product } from "@/data/products";
import { depositPerUnit, formatReleaseDate } from "@/lib/preorder";
import { useLocale } from "@/i18n/LocaleLink";

/** Deposit / balance breakdown shown on the product page of a preorder product. */
const PreorderNotice = ({ product }: { product: Product }) => {
  const { t } = useTranslation("shop");
  const lang = useLocale();
  if (!product.preorder) return null;

  const unitPrice = product.salePrice ?? product.price;
  const deposit = depositPerUnit(unitPrice, product.preorder);
  const balance = Math.round((unitPrice - deposit) * 100) / 100;
  const { releaseDate } = product.preorder;

  return (
    <div className="rounded-2xl border border-accent/25 bg-secondary/50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-brand-gradient px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
          {t("preorder.badge")}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock size={14} aria-hidden="true" />
          {releaseDate ? t("preorder.ships", { date: formatReleaseDate(releaseDate, lang) }) : t("preorder.shipsSoon")}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-background p-3">
          <dt className="text-xs text-muted-foreground">{t("preorder.depositToday")}</dt>
          <dd className="font-serif text-2xl text-foreground">{formatPrice(deposit)}</dd>
        </div>
        <div className="rounded-xl bg-background p-3">
          <dt className="text-xs text-muted-foreground">{t("preorder.balanceLater")}</dt>
          <dd className="font-serif text-2xl text-foreground">{formatPrice(balance)}</dd>
        </div>
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("preorder.note")}</p>
    </div>
  );
};

export default PreorderNotice;
