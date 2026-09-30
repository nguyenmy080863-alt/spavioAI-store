import deviceFinderImage from "@/assets/brand/device-finder.svg";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/LocaleLink";
import { useTranslation } from "react-i18next";

const LargeHero = () => {
  const { t } = useTranslation("home");
  return (
    <section className="w-full mb-16 px-6">
      <Link to="/about/device-guide" className="block group">
        <div className="relative w-full aspect-[4/5] sm:aspect-[16/9] mb-3 overflow-hidden rounded-2xl">
          <img
            src={deviceFinderImage}
            alt={t("largeHero.alt")}
            loading="lazy"
            className="w-full h-full object-cover object-[70%_center] transition-transform duration-700 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1E1633]/85 via-[#1E1633]/40 to-transparent" aria-hidden="true" />
          <div className="absolute inset-0 flex items-end sm:items-center">
            <div className="p-8 sm:p-14 max-w-lg space-y-4">
              <p className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#D4B8FF] font-semibold">
                {t("largeHero.eyebrow")}
              </p>
              <h2 className="text-3xl sm:text-5xl font-serif font-light text-white leading-tight">
                {t("largeHero.title")}
              </h2>
              <p className="text-sm sm:text-base font-light text-white/80 leading-relaxed">
                {t("largeHero.subtitle")}
              </p>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/25 backdrop-blur-md px-6 py-3 text-[10px] sm:text-xs font-semibold tracking-[0.2em] uppercase text-white group-hover:bg-white group-hover:text-[#5346A7] transition-colors duration-300">
                {t("largeHero.cta")}
                <ArrowRight size={14} />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
};

export default LargeHero;
