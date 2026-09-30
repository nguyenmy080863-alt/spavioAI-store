import { useTranslation } from "react-i18next";
import { formatPrice } from "@/data/products";
import { useFomoCampaign, useFomoTimer } from "@/hooks/useFomo";
import { fomoOfferPrice } from "@/lib/fomo";

interface FomoCountdownProps {
  /** Product slug — when given, the widget only shows for mapped products. */
  slug?: string;
  /** Base price used to derive the simulated sale price. */
  basePrice?: number;
  className?: string;
}

const pad = (value: number) => value.toString().padStart(2, "0");

const FomoCountdown = ({ slug, basePrice, className }: FomoCountdownProps) => {
  const { t } = useTranslation("shop");
  const { data: bundle } = useFomoCampaign();
  const timer = useFomoTimer(bundle?.campaign ?? null);

  if (!bundle || !timer) return null;

  const offer = slug ? bundle.offersBySlug[slug] : undefined;
  if (slug && !offer) return null;

  const salePrice =
    basePrice !== undefined ? fomoOfferPrice(basePrice, offer) : null;

  const remaining = timer.totalStock - timer.sold;
  const soldPct = timer.soldPercent;

  return (
    <div
      className={`relative w-full rounded-lg border-2 border-[#A873FF]/50 bg-[#120D1F] text-[#F5F2FC] p-6 sm:p-10 md:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.4),0_0_40px_rgba(118,29,234,0.15)] transition-all duration-300 ${className ?? ""}`}
    >
      {/* Top violet accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#A873FF] to-transparent" />

      {/* Background ambient glow */}
      <div className="absolute -inset-1 bg-gradient-to-r from-[#A873FF]/10 via-transparent to-[#A873FF]/10 rounded-lg blur-xl pointer-events-none opacity-60" />

      <div className={`relative w-full flex flex-col justify-between gap-8 sm:gap-10 ${slug ? "" : "xl:flex-row xl:items-center"}`}>
        
        {/* Left column: Campaign Headline & Price */}
        <div className="space-y-3 min-w-0 flex-1">
          <div className="flex items-center gap-3 whitespace-nowrap overflow-x-auto no-scrollbar py-1">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
            </span>
            <span className="text-sm sm:text-base uppercase tracking-[0.2em] sm:tracking-[0.25em] font-extrabold text-[#A873FF] shrink-0">
              {t(`fomo.headlines.${bundle.campaign.id}`, { defaultValue: bundle.campaign.headline })}
            </span>
            {salePrice !== null && basePrice !== undefined && salePrice < basePrice && (
              <span className="text-xs font-extrabold tracking-widest uppercase px-3 py-1 bg-[#A873FF] text-[#120D1F] rounded-sm shadow-md shrink-0">
                {t("fomo.save", {
                  percent: Math.round(((basePrice - salePrice) / basePrice) * 100),
                })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
            {salePrice !== null && basePrice !== undefined && salePrice < basePrice ? (
              <>
                <span className="text-3xl sm:text-4xl md:text-5xl font-serif text-white font-normal tracking-tight">
                  {formatPrice(salePrice)}
                </span>
                <span className="text-lg sm:text-xl font-light text-[#A79DC9] line-through">
                  {formatPrice(basePrice)}
                </span>
              </>
            ) : (
              <h3 className="text-xl sm:text-2xl md:text-3xl font-serif font-light text-white tracking-wide">
                {t("fomo.endsIn") || "Limited Time Event"}
              </h3>
            )}
          </div>
        </div>

        {/* Center: Flexible Digit Tiles */}
        <div className={`flex items-center gap-2.5 sm:gap-4 border-y border-[#A873FF]/30 py-5 justify-center shrink-0 ${slug ? "" : "xl:border-y-0 xl:border-x xl:py-0 xl:px-8"}`}>
          
          {/* Hours */}
          <div className="text-center px-3 sm:px-5 py-3 sm:py-4 bg-[#241A3F] border border-[#A873FF]/40 rounded-sm min-w-[68px] sm:min-w-[88px] shadow-inner">
            <span className="font-serif text-2xl sm:text-4xl md:text-5xl font-semibold text-white tabular-nums block leading-none">
              {pad(timer.hours)}
            </span>
            <span className="block text-[10px] sm:text-xs uppercase tracking-[0.2em] text-[#E9E1FB] font-sans font-bold mt-2">
              {t("fomo.hours", "Hours")}
            </span>
          </div>

          <span className="text-[#A873FF] font-serif text-2xl sm:text-3xl font-bold select-none pb-4">:</span>

          {/* Minutes */}
          <div className="text-center px-3 sm:px-5 py-3 sm:py-4 bg-[#241A3F] border border-[#A873FF]/40 rounded-sm min-w-[68px] sm:min-w-[88px] shadow-inner">
            <span className="font-serif text-2xl sm:text-4xl md:text-5xl font-semibold text-white tabular-nums block leading-none">
              {pad(timer.minutes)}
            </span>
            <span className="block text-[10px] sm:text-xs uppercase tracking-[0.2em] text-[#E9E1FB] font-sans font-bold mt-2">
              {t("fomo.minutes", "Minutes")}
            </span>
          </div>

          <span className="text-[#A873FF] font-serif text-2xl sm:text-3xl font-bold select-none pb-4">:</span>

          {/* Seconds */}
          <div className="text-center px-3 sm:px-5 py-3 sm:py-4 bg-[#241A3F] border border-[#A873FF]/40 rounded-sm min-w-[68px] sm:min-w-[88px] shadow-inner">
            <span className="font-serif text-2xl sm:text-4xl md:text-5xl font-semibold text-white tabular-nums block leading-none">
              {pad(timer.seconds)}
            </span>
            <span className="block text-[10px] sm:text-xs uppercase tracking-[0.2em] text-[#E9E1FB] font-sans font-bold mt-2">
              {t("fomo.seconds", "Seconds")}
            </span>
          </div>

        </div>

        {/* Right column: Fully Flexible Progress Bar (Overflow-Proof) */}
        <div className={`space-y-3 min-w-0 flex-1 ${slug ? "" : "xl:max-w-xs"}`}>
          <div className="flex items-center justify-between gap-2 text-xs sm:text-sm font-sans font-semibold tracking-wide">
            <span className="text-[#E9E1FB] truncate">
              {remaining > 0 ? t("fomo.remaining", { count: remaining }) : t("fomo.soldOut")}
            </span>
            <span className="font-bold text-[#A873FF] shrink-0">
              {t("fomo.claimed", { percent: soldPct })}
            </span>
          </div>
          <div className="h-3 w-full bg-[#1B1430] rounded-full overflow-hidden border border-[#A873FF]/40 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-[#761DEA] via-[#A873FF] to-[#D4B8FF] rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(118,29,234,0.8)]"
              style={{ width: `${soldPct}%` }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={timer.totalStock}
              aria-valuenow={timer.sold}
            />
          </div>
        </div>

      </div>
    </div>
  );
};

export default FomoCountdown;
