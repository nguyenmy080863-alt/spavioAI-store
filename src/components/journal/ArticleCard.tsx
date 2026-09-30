import { ArrowRight, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "@/i18n/LocaleLink";
import { LOCAL_ASSETS } from "@/data/products";
import { journalArticlePath, type JournalArticle } from "@/data/journal";

/** Artwork of the guide's lead product on the brand's lilac stage. */
export const ArticleArt = ({ article, className = "" }: { article: JournalArticle; className?: string }) => {
  const src = LOCAL_ASSETS[article.productIds[0]];
  return (
    <div
      className={`relative overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#FFFFFF_0%,#F3EDFE_45%,#E4D8FB_100%)] ${className}`}
    >
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-[70%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#A78CE1]/30" />
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-[1.04]"
        />
      )}
    </div>
  );
};

const ArticleCard = ({ article }: { article: JournalArticle }) => {
  const { t } = useTranslation("journal");
  const title = t(`articles.${article.slug}.title`);

  return (
    <Link
      to={journalArticlePath(article.slug)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-shadow duration-300 hover:shadow-[0_12px_40px_rgba(83,70,167,0.12)]"
    >
      <ArticleArt article={article} className="aspect-[16/10]" />
      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
          <span>{t(`hub.topics.${article.topic}`)}</span>
          <span className="inline-flex items-center gap-1 font-medium normal-case tracking-normal text-muted-foreground">
            <Clock size={12} aria-hidden="true" />
            {t("hub.minRead", { count: article.readingMinutes })}
          </span>
        </div>
        <h2 className="font-serif text-xl leading-snug text-foreground sm:text-2xl">{title}</h2>
        <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{t(`articles.${article.slug}.excerpt`)}</p>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
          {t("hub.readGuide")}
          <ArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
};

export default ArticleCard;
