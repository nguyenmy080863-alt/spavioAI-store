import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Clock } from "lucide-react";
import Header from "@/components/header/Header";
import Footer from "@/components/footer/Footer";
import SEO, { SITE_URL, absoluteUrl } from "@/components/SEO";
import ProductCarousel from "@/components/content/ProductCarousel";
import ArticleCard, { ArticleArt } from "@/components/journal/ArticleCard";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Link, useLocale } from "@/i18n/LocaleLink";
import { useStorefrontProducts } from "@/hooks/useCatalog";
import {
  JOURNAL_ARTICLES,
  JOURNAL_PATH,
  getJournalArticle,
  journalArticlePath,
  type JournalArticleText,
} from "@/data/journal";
import NotFound from "../NotFound";

const sectionId = (index: number) => `section-${index + 1}`;

const formatDate = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

const JournalArticle = () => {
  const { slug } = useParams();
  const { t } = useTranslation("journal");
  const lang = useLocale();
  const { data: products = [] } = useStorefrontProducts();
  const article = getJournalArticle(slug);

  if (!article) return <NotFound />;

  const text = t(`articles.${article.slug}`, { returnObjects: true }) as JournalArticleText;
  const path = journalArticlePath(article.slug);
  const featured = article.productIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const moreGuides = [
    ...JOURNAL_ARTICLES.filter((a) => a.slug !== article.slug && a.topic === article.topic),
    ...JOURNAL_ARTICLES.filter((a) => a.slug !== article.slug && a.topic !== article.topic),
  ].slice(0, 3);
  const shareImage = `${SITE_URL}/og/products/${article.productIds[0]}.jpg`;
  const organization = { "@type": "Organization", name: "Spavio AI", url: SITE_URL };

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: text.title,
      description: text.description,
      image: [shareImage],
      datePublished: article.published,
      dateModified: article.updated,
      inLanguage: lang,
      author: organization,
      publisher: { ...organization, logo: { "@type": "ImageObject", url: `${SITE_URL}/spavioai-logo.png` } },
      mainEntityOfPage: absoluteUrl(path, lang),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: text.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: t("article.home"), item: absoluteUrl("/", lang) },
        { "@type": "ListItem", position: 2, name: t("article.journal"), item: absoluteUrl(JOURNAL_PATH, lang) },
        { "@type": "ListItem", position: 3, name: text.title, item: absoluteUrl(path, lang) },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO title={text.title} description={text.description} canonical={path} ogImage={shareImage} jsonLd={jsonLd} />
      <Header />

      <main className="mx-auto max-w-6xl px-5 pt-6 sm:px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">{t("article.home")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={JOURNAL_PATH}>{t("article.journal")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbPage className="line-clamp-1">{text.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <article>
          <header className="grid items-center gap-8 border-b border-border/60 pb-10 pt-8 lg:grid-cols-[1.3fr_1fr] lg:gap-12">
            <div>
              <span className="mb-3 block text-[10px] font-semibold uppercase tracking-[0.3em] text-accent sm:text-xs">
                {t(`hub.topics.${article.topic}`)}
              </span>
              <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl lg:text-5xl">{text.title}</h1>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">{text.intro}</p>
              <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{t("article.author")}</span>
                <span>
                  <time dateTime={article.published}>{t("article.published", { date: formatDate(article.published, lang) })}</time>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} aria-hidden="true" />
                  {t("hub.minRead", { count: article.readingMinutes })}
                </span>
              </p>
            </div>
            <ArticleArt article={article} className="aspect-[4/3] rounded-2xl" />
          </header>

          <div className="grid gap-10 py-10 lg:grid-cols-[1fr_16rem] lg:gap-16">
            {/* Table of contents: first on mobile, sticky sidebar on desktop */}
            <nav aria-labelledby="toc-title" className="h-fit rounded-2xl border border-border/60 p-5 lg:order-2 lg:sticky lg:top-32">
              <p id="toc-title" className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-accent">
                {t("article.inThisGuide")}
              </p>
              <ol className="space-y-2 text-sm">
                {text.sections.map((section, index) => (
                  <li key={section.heading}>
                    <a href={`#${sectionId(index)}`} className="text-muted-foreground transition-colors hover:text-foreground">
                      {section.heading}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="#faq" className="text-muted-foreground transition-colors hover:text-foreground">
                    {t("article.faqTitle")}
                  </a>
                </li>
              </ol>
            </nav>

            <div className="min-w-0 max-w-2xl lg:order-1">
              {text.sections.map((section, index) => (
                <section key={section.heading} id={sectionId(index)} className="scroll-mt-32 pb-8">
                  <h2 className="mb-4 font-serif text-2xl text-foreground md:text-3xl">{section.heading}</h2>
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph} className="mb-4 leading-relaxed text-foreground/80">
                      {paragraph}
                    </p>
                  ))}
                  {section.bullets && (
                    <ul className="space-y-2.5">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex gap-3 leading-relaxed text-foreground/80">
                          <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}

              <section id="faq" className="scroll-mt-32 pb-8">
                <h2 className="mb-4 font-serif text-2xl text-foreground md:text-3xl">{t("article.faqTitle")}</h2>
                <div className="divide-y divide-border/60 rounded-2xl border border-border/60">
                  {text.faq.map((item) => (
                    <details key={item.question} className="group px-5 py-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                        <h3 className="text-base">{item.question}</h3>
                        <ChevronDown size={18} className="shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
                      </summary>
                      <p className="mt-3 leading-relaxed text-muted-foreground">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </section>

              <p className="rounded-2xl bg-secondary/60 p-5 text-xs leading-relaxed text-muted-foreground">{t("article.disclaimer")}</p>
            </div>
          </div>
        </article>
      </main>

      {featured.length > 0 && (
        <section className="w-full" aria-labelledby="featured-devices">
          <div className="mx-auto mb-4 max-w-6xl px-5 sm:px-6">
            <h2 id="featured-devices" className="font-serif text-2xl text-foreground">
              {t("article.featuredDevices")}
            </h2>
          </div>
          <div className="mx-auto max-w-6xl">
            <ProductCarousel items={featured} />
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-6" aria-labelledby="more-guides">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 id="more-guides" className="font-serif text-2xl text-foreground">
            {t("article.moreGuides")}
          </h2>
          <Link to={JOURNAL_PATH} className="text-sm font-medium text-accent hover:text-brand-secondary">
            {t("article.backToJournal")}
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {moreGuides.map((guide) => (
            <ArticleCard key={guide.slug} article={guide} />
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default JournalArticle;
