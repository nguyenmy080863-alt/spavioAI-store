import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/LocaleLink";
import { useTranslation } from "react-i18next";

const EditorialSection = () => {
  const { t } = useTranslation("home");
  return (
    <section className="w-full mb-16 px-6">
      <div className="max-w-3xl mx-auto text-center space-y-5 rounded-2xl border border-accent/15 bg-secondary/40 px-6 py-14 sm:px-14">
        <p className="text-[10px] tracking-[0.3em] uppercase text-accent font-semibold">{t("editorial.eyebrow")}</p>
        <h2 className="text-2xl md:text-3xl font-normal text-foreground leading-tight">
          {t("editorial.title")}
        </h2>
        <p className="text-sm sm:text-base font-light text-foreground leading-relaxed">
          {t("editorial.body")}
        </p>
        <Link
          to="/about/our-story"
          className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-brand-secondary transition-colors duration-200"
        >
          <span>{t("editorial.readMore")}</span>
          <ArrowRight size={12} />
        </Link>
      </div>
    </section>
  );
};

export default EditorialSection;
