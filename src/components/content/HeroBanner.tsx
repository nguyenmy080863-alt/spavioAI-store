import { Link } from "@/i18n/LocaleLink";
import { useTranslation } from "react-i18next";
import { heroImage } from "@/data/products";
import { useHeroBanner } from "@/hooks/useHero";
import LumiporeHero from "./LumiporeHero";

const alignClass: Record<string, string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

const HeroBanner = () => {
  const { t } = useTranslation("home");
  const { data } = useHeroBanner();

  if (data && !data.is_active) return null;

  // Without a custom banner image from the admin panel, feature Spavio Lumipore.
  if (!data?.resolvedImageUrl) return <LumiporeHero />;

  const image = data?.resolvedImageUrl ?? heroImage;
  const title = data?.title?.trim() || t("hero.title");
  const subtitle = data?.subtitle?.trim() || t("hero.subtitle");
  const alt = data?.image_alt?.trim() || t("hero.alt");
  const align = alignClass[data?.text_align ?? "left"] ?? alignClass.left;
  const overlay = Math.min(Math.max(Number(data?.overlay_opacity ?? 0.35), 0), 1);

  return (
    <section className="relative w-full overflow-hidden group">
      <div className="relative w-full h-[75vh] min-h-[500px] max-h-[850px] overflow-hidden">
        <img 
          src={image} 
          alt={alt} 
          {...{ fetchpriority: "high" }}
          loading="eager"
          className="w-full h-full object-cover transition-transform ease-out scale-100 group-hover:scale-105" 
          style={{ transitionDuration: "6000ms" }}
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#1E1633]/80 via-[#1E1633]/35 to-transparent"
          style={{ opacity: Math.max(overlay, 0.4) }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1E1633]/70 via-[#1E1633]/25 to-transparent" aria-hidden="true" />
        <div className="absolute inset-0 flex items-end">
          <div className={`w-full max-w-6xl mx-auto px-8 pb-16 flex flex-col gap-4 ${align}`}>
            {data?.eyebrow?.trim() ? (
              <p className="text-[0.65rem] sm:text-xs tracking-[0.3em] uppercase text-[#D4B8FF] font-semibold">
                {data.eyebrow}
              </p>
            ) : (
              <p className="text-[0.65rem] sm:text-xs tracking-[0.3em] uppercase text-[#D4B8FF] font-semibold">
                {t("hero.eyebrow")}
              </p>
            )}
            <h1 className="text-4xl sm:text-6xl font-serif font-light text-white max-w-2xl leading-[1.15] drop-shadow-sm">
              {title}
            </h1>
            <p className="text-sm sm:text-base font-light text-white/80 max-w-lg leading-relaxed font-sans">
              {subtitle}
            </p>
            {data?.cta_label?.trim() && data?.cta_href?.trim() ? (
              <Link
                to={data.cta_href}
                className="mt-4 inline-block rounded-full bg-brand-gradient text-white text-[10px] sm:text-xs font-semibold tracking-[0.25em] uppercase px-8 py-4 shadow-glow hover:brightness-110 transition-[filter,transform] duration-300 hover:-translate-y-0.5"
              >
                {data.cta_label}
              </Link>
            ) : (
              <Link
                to="/category/shop"
                className="mt-4 inline-block rounded-full bg-brand-gradient text-white text-[10px] sm:text-xs font-semibold tracking-[0.25em] uppercase px-8 py-4 shadow-glow hover:brightness-110 transition-[filter,transform] duration-300 hover:-translate-y-0.5"
              >
                {t("hero.cta") || "Explore Catalog"}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
