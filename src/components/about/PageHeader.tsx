import { useTranslation } from "react-i18next";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

const PageHeader = ({ title, subtitle }: PageHeaderProps) => {
  const { t } = useTranslation("about");
  return (
    <header className="pt-10 pb-12 border-b border-border/60">
      <span className="text-[10px] sm:text-xs uppercase tracking-[0.3em] text-accent font-semibold block mb-3">
        {t("pageHeader.eyebrow")}
      </span>
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-normal text-foreground tracking-wide mb-4">
        {title}
      </h1>
      {subtitle && (
        <p className="text-base sm:text-lg text-muted-foreground font-normal max-w-2xl leading-relaxed">
          {subtitle}
        </p>
      )}
    </header>
  );
};

export default PageHeader;