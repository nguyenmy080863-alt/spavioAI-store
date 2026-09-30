import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import Header from "@/components/header/Header";
import Footer from "@/components/footer/Footer";
import SEO, { absoluteUrl } from "@/components/SEO";
import ArticleCard from "@/components/journal/ArticleCard";
import { Link, useLocale } from "@/i18n/LocaleLink";
import { JOURNAL_ARTICLES, JOURNAL_PATH, journalArticlePath } from "@/data/journal";

const JournalIndex = () => {
  const { t } = useTranslation("journal");
  const lang = useLocale();

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: t("hub.title"),
      description: t("hub.subtitle"),
      url: absoluteUrl(JOURNAL_PATH, lang),
      inLanguage: lang,
      mainEntity: {
        "@type": "ItemList",
        itemListElement: JOURNAL_ARTICLES.map((article, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: absoluteUrl(journalArticlePath(article.slug), lang),
          name: t(`articles.${article.slug}.title`),
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: t("article.home"), item: absoluteUrl("/", lang) },
        { "@type": "ListItem", position: 2, name: t("article.journal"), item: absoluteUrl(JOURNAL_PATH, lang) },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO page="journal" canonical={JOURNAL_PATH} jsonLd={jsonLd} />
      <Header />

      <main className="mx-auto max-w-6xl px-5 sm:px-6">
        <header className="border-b border-border/60 pb-10 pt-10 sm:pb-12 sm:pt-14">
          <span className="mb-3 block text-[10px] font-semibold uppercase tracking-[0.3em] text-accent sm:text-xs">
            {t("hub.eyebrow")}
          </span>
          <h1 className="mb-4 font-serif text-4xl font-normal tracking-wide text-foreground sm:text-5xl">{t("hub.title")}</h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{t("hub.subtitle")}</p>
        </header>

        <section className="py-10 sm:py-14" aria-labelledby="journal-all">
          <h2 id="journal-all" className="sr-only">
            {t("hub.latest")}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {JOURNAL_ARTICLES.map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        </section>

        <section className="mb-16 flex flex-col items-start gap-4 rounded-2xl bg-brand-gradient p-8 text-white sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h2 className="font-serif text-2xl">{t("hub.ctaTitle")}</h2>
            <p className="mt-2 max-w-xl text-sm text-white/85">{t("hub.ctaText")}</p>
          </div>
          <Link
            to="/about/device-guide"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#5346A7] transition-transform duration-300 hover:-translate-y-0.5"
          >
            {t("hub.ctaButton")}
            <ArrowRight size={14} />
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default JournalIndex;
