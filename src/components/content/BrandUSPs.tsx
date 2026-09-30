import { BadgeCheck, ShieldCheck, RotateCcw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

const BrandUSPs = () => {
  const { t } = useTranslation("common");

  const usps = [
    { key: "certified", icon: <BadgeCheck className="w-5 h-5 text-white stroke-[1.5]" /> },
    { key: "warranty", icon: <ShieldCheck className="w-5 h-5 text-white stroke-[1.5]" /> },
    { key: "trial", icon: <RotateCcw className="w-5 h-5 text-white stroke-[1.5]" /> },
    { key: "aiCoach", icon: <Sparkles className="w-5 h-5 text-white stroke-[1.5]" /> },
  ];

  return (
    <section className="w-full bg-secondary/50 border-t border-b border-accent/10 py-16 px-6 my-20">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {usps.map((usp) => (
            <div
              key={usp.key}
              className="flex flex-col items-center text-center p-4 rounded-2xl hover:bg-background/60 transition-[background-color,transform] duration-300 hover:-translate-y-1 group"
            >
              <div className="mb-4 p-3 bg-brand-gradient rounded-full shadow-glow group-hover:scale-110 transition-transform duration-300">
                {usp.icon}
              </div>
              <h3 className="text-sm font-semibold tracking-wider text-foreground mb-2 uppercase">
                {t(`usps.${usp.key}.title`)}
              </h3>
              <p className="text-xs font-light text-muted-foreground leading-relaxed max-w-[240px]">
                {t(`usps.${usp.key}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BrandUSPs;
