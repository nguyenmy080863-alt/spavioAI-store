import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, MoveHorizontal } from "lucide-react";
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

// We only have front photos, so the device turns within these limits instead of a full 360°.
const MAX_TURN = 35;
const MAX_TILT = 12;
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

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

  // Drag / swipe to turn the device; it springs back to the front when released.
  const [turn, setTurn] = useState({ y: 0, x: 0 });
  const [dragging, setDragging] = useState(false);
  const [hasTurned, setHasTurned] = useState(false);
  const dragStart = useRef({ px: 0, py: 0, y: 0, x: 0 });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button") || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { px: e.clientX, py: e.clientY, ...turn };
    setDragging(true);
    setHasTurned(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const start = dragStart.current;
    setTurn({
      y: clamp(start.y + (e.clientX - start.px) * 0.35, MAX_TURN),
      x: clamp(start.x - (e.clientY - start.py) * 0.15, MAX_TILT),
    });
  };

  const endDrag = () => {
    setDragging(false);
    setTurn({ y: 0, x: 0 });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -10, ArrowRight: 10 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    setHasTurned(true);
    setTurn((current) => ({ y: clamp(current.y + step, MAX_TURN), x: 0 }));
  };

  const price = product?.salePrice ?? product?.price;
  const regular = product?.salePrice ? product.price : undefined;
  const savePercent = regular && price ? Math.round(((regular - price) / regular) * 100) : 0;
  const mode = MODES[active];

  return (
    <section className="relative w-full overflow-hidden bg-[radial-gradient(ellipse_at_72%_35%,#FFFFFF_0%,#F3EDFE_42%,#E4D8FB_100%)]">
      <div className="max-w-7xl mx-auto grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[1fr_1.1fr] items-center px-5 sm:px-6 lg:px-10">
        {/* Copy */}
        <div className="relative z-10 order-2 lg:order-1 pb-14 lg:py-24 space-y-6">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            {t("lumipore.eyebrow")}
          </p>
          <h1 className="font-serif italic font-semibold leading-[0.9] text-6xl min-[375px]:text-7xl sm:text-8xl xl:text-9xl text-brand-gradient pb-2">
            <span className="sr-only">Spavio </span>Lumipore
          </h1>
          <p className="max-w-md text-lg sm:text-xl font-light text-foreground/80 leading-relaxed">
            {t("lumipore.subtitle")}
          </p>

          {price !== undefined && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-accent">{t("lumipore.priceLabel")}</p>
              <div className="flex items-end gap-4">
                <span className="font-serif text-4xl min-[375px]:text-5xl sm:text-6xl text-foreground leading-none">{formatPrice(price)}</span>
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
              className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-6 min-[375px]:px-8 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-glow transition-[filter,transform] duration-300 hover:-translate-y-0.5 hover:brightness-110"
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
        <div
          className={`relative order-1 lg:order-2 h-[460px] sm:h-[560px] lg:h-[720px] touch-pan-y select-none ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* Rings echoing the product banner */}
          <div aria-hidden="true" className="absolute left-1/2 top-[38%] h-[340px] w-[340px] sm:h-[440px] sm:w-[440px] lg:h-[560px] lg:w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#A78CE1]/35" />
          <div aria-hidden="true" className="absolute left-1/2 top-[38%] h-[240px] w-[240px] sm:h-[310px] sm:w-[310px] lg:h-[400px] lg:w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#A78CE1]/25" />

          {/* Rotate hint, hidden after the first turn */}
          <p
            aria-hidden="true"
            className={`pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-medium text-foreground/70 shadow-sm backdrop-blur-md transition-opacity duration-500 ${
              hasTurned ? "opacity-0" : "opacity-100"
            }`}
          >
            <MoveHorizontal size={14} />
            {t("lumipore.rotateHint")}
          </p>

          {/* Device: slight tilt + gentle float; spins in on load, turns on drag; light modes crossfade */}
          <div
            role="slider"
            tabIndex={0}
            aria-label={t("lumipore.rotateLabel")}
            aria-valuemin={-MAX_TURN}
            aria-valuemax={MAX_TURN}
            aria-valuenow={Math.round(turn.y)}
            aria-valuetext={`${Math.round(turn.y)}°`}
            onKeyDown={onKeyDown}
            onBlur={() => setTurn({ y: 0, x: 0 })}
            className="absolute bottom-0 left-1/2 h-[96%] -translate-x-1/2 rotate-[-6deg] origin-bottom rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <div className="h-full aspect-[165/564] motion-safe:animate-spin-in">
              <div
                className="h-full aspect-[165/564]"
                style={{
                  transform: `perspective(1200px) rotateY(${turn.y}deg) rotateX(${turn.x}deg)`,
                  transition: dragging ? "none" : "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
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
                      draggable={false}
                      className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-700 ${
                        index === active ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  ))}
                  {/* Light reflection that sweeps across the device as it turns, clipped to its outline */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 mix-blend-soft-light"
                    style={{
                      backgroundImage: "linear-gradient(100deg, transparent 38%, rgba(255,255,255,0.9) 50%, transparent 62%)",
                      backgroundSize: "300% 100%",
                      backgroundPosition: `${50 - turn.y * 1.4}% 0`,
                      opacity: 0.35 + (Math.abs(turn.y) / MAX_TURN) * 0.65,
                      transition: dragging ? "none" : "background-position 700ms ease-out, opacity 700ms ease-out",
                      maskImage: `url(${mode.image})`,
                      WebkitMaskImage: `url(${mode.image})`,
                      maskSize: "contain",
                      WebkitMaskSize: "contain",
                      maskRepeat: "no-repeat",
                      WebkitMaskRepeat: "no-repeat",
                      maskPosition: "center",
                      WebkitMaskPosition: "center",
                    }}
                  />
                </div>
              </div>
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
