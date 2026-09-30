import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/LocaleLink";
import { formatPrice, getProduct } from "@/data/products";
import { useStorefrontProduct } from "@/hooks/useCatalog";
import warmImage from "@/assets/brand/lumipore-warm.png";
import serumImage from "@/assets/brand/lumipore-serum.png";
import liftImage from "@/assets/brand/lumipore-lift.png";
import glowImage from "@/assets/brand/lumipore-glow.png";

/** The four Lumipore light modes; each image shows the device's LED in that colour. */
const MODES = [
  { key: "warm", image: warmImage, color: "#F04E6E" },
  { key: "serum", image: serumImage, color: "#3ECF8E" },
  { key: "lift", image: liftImage, color: "#3B9BFF" },
  { key: "glow", image: glowImage, color: "#F5B14A" },
] as const;

const PRODUCT_ID = "lumipore";
const MODE_INTERVAL_MS = 3200;
const DEFAULT_MODE = 2; // blue — the colour in the original product photo

const LumiporeHero = () => {
  const { t } = useTranslation("home");
  const [active, setActive] = useState(DEFAULT_MODE);
  const [autoplay, setAutoplay] = useState(true);
  const { product: liveProduct } = useStorefrontProduct(PRODUCT_ID);
  const product = liveProduct ?? getProduct(PRODUCT_ID);

  // Cycle through the light modes until the visitor picks one (skipped for reduced motion).
  useEffect(() => {
    if (!autoplay || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % MODES.length), MODE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [autoplay]);

  const price = product?.salePrice ?? product?.price;
  const regular = product?.salePrice ? product.price : undefined;
  const savePercent = regular && price ? Math.round(((regular - price) / regular) * 100) : 0;
  const mode = MODES[active];

  return (
    <section className="relative w-full overflow-hidden bg-[radial-gradient(ellipse_at_72%_35%,#FFFFFF_0%,#F3EDFE_42%,#E4D8FB_100%)]">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-[1fr_1.1fr] items-center px-6 lg:px-10">
        {/* Copy */}
        <div className="relative z-10 order-2 lg:order-1 pb-14 lg:py-24 space-y-6">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            {t("lumipore.eyebrow")}
          </p>
          <h1 className="font-serif italic font-semibold leading-[0.9] text-7xl sm:text-8xl xl:text-9xl text-brand-gradient pb-2">
            <span className="sr-only">Spavio </span>Lumipore
          </h1>
          <p className="max-w-md text-lg sm:text-xl font-light text-foreground/80 leading-relaxed">
            {t("lumipore.subtitle")}
          </p>

          {price !== undefined && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-accent">{t("lumipore.priceLabel")}</p>
              <div className="flex items-end gap-4">
                <span className="font-serif text-5xl sm:text-6xl text-foreground leading-none">{formatPrice(price)}</span>
                {regular !== undefined && (
                  <span className="pb-1 text-sm text-muted-foreground leading-tight">
                    {t("lumipore.instead")} <s>{formatPrice(regular)}</s>
                    <span className="block font-serif italic text-accent">{t("lumipore.save", { percent: savePercent })}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-5 pt-2">
            <Link
              to={`/product/${PRODUCT_ID}`}
              className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-8 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-glow transition-[filter,transform] duration-300 hover:-translate-y-0.5 hover:brightness-110"
            >
              {t("lumipore.cta")}
              <ArrowRight size={14} />
            </Link>
            <Link to="/category/shop" className="text-sm font-medium text-accent hover:text-brand-secondary transition-colors">
              {t("lumipore.secondary")}
            </Link>
          </div>
        </div>

        {/* Product stage */}
        <div className="relative order-1 lg:order-2 h-[460px] sm:h-[560px] lg:h-[720px]">
          {/* Rings echoing the product banner */}
          <div aria-hidden="true" className="absolute left-1/2 top-[38%] h-[340px] w-[340px] sm:h-[440px] sm:w-[440px] lg:h-[560px] lg:w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#A78CE1]/35" />
          <div aria-hidden="true" className="absolute left-1/2 top-[38%] h-[240px] w-[240px] sm:h-[310px] sm:w-[310px] lg:h-[400px] lg:w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#A78CE1]/25" />

          {/* Device: slight tilt + gentle float; light modes crossfade */}
          <div className="absolute bottom-0 left-1/2 h-[96%] -translate-x-1/2 rotate-[-6deg] origin-bottom">
            <div className="relative h-full aspect-[165/564] motion-safe:animate-float [mask-image:linear-gradient(to_bottom,black_78%,transparent)]">
              {MODES.map((m, index) => (
                <img
                  key={m.key}
                  src={m.image}
                  alt={index === DEFAULT_MODE ? t("lumipore.deviceAlt") : ""}
                  aria-hidden={index === DEFAULT_MODE ? undefined : true}
                  width={165}
                  height={564}
                  loading="eager"
                  decoding="async"
                  className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-700 ${
                    index === active ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Light-mode selector */}
          <div className="absolute bottom-6 left-1/2 w-[min(100%,30rem)] -translate-x-1/2 lg:bottom-auto lg:left-auto lg:right-0 lg:top-1/2 lg:w-60 lg:translate-x-0 lg:-translate-y-1/2">
            <p className="mb-2 hidden lg:block text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              {t("lumipore.modesLabel")}
            </p>
            <div role="group" aria-label={t("lumipore.modesLabel")} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1">
              {MODES.map((m, index) => (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={index === active}
                  onClick={() => {
                    setActive(index);
                    setAutoplay(false);
                  }}
                  className={`flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold backdrop-blur-md transition-colors lg:justify-start lg:rounded-2xl lg:px-4 lg:py-3 ${
                    index === active
                      ? "border-transparent bg-white text-foreground shadow-glow"
                      : "border-white/70 bg-white/80 text-muted-foreground hover:bg-white"
                  }`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="truncate">{t(`lumipore.modes.${m.key}.name`)}</span>
                </button>
              ))}
            </div>
            <p aria-live="polite" className="mt-3 hidden lg:block text-sm leading-relaxed text-foreground/75">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t(`lumipore.modes.${mode.key}.light`)}
              </span>
              {t(`lumipore.modes.${mode.key}.text`)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LumiporeHero;
