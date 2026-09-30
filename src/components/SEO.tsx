import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, localizePath } from "@/i18n";
import { useLocale } from "@/i18n/LocaleLink";

export const SITE_URL = "https://spavioai.store";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpg`;
const SITE_NAME = "Spavio AI Store";

/** Absolute URL of an unprefixed path in a given language. */
export const absoluteUrl = (path: string, lang: string = DEFAULT_LANGUAGE) =>
  `${SITE_URL}${localizePath(path, lang as (typeof SUPPORTED_LANGUAGES)[number]["code"])}`;

interface SEOProps {
  /** Key in the "seo" namespace (e.g. "ourStory"); supplies title and description when those are omitted. */
  page?: string;
  title?: string;
  description?: string;
  /** Unprefixed path of this page (e.g. "/product/silk-ipl"); the language prefix is added per locale. */
  canonical?: string;
  ogImage?: string;
  ogType?: "website" | "product";
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const SEO = ({
  page,
  title: titleProp,
  description: descriptionProp,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  noindex = false,
  jsonLd,
}: SEOProps) => {
  const lang = useLocale();
  const { t } = useTranslation("seo");
  const title = titleProp ?? (page ? t(`${page}.title`) : "");
  const description = descriptionProp ?? (page ? t(`${page}.description`) : "");
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = canonical ? absoluteUrl(canonical, lang) : undefined;
  const ogLocale = SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.ogLocale ?? "de_DE";
  const alternates = canonical && !noindex ? SUPPORTED_LANGUAGES : [];

  return (
    <Helmet htmlAttributes={{ lang }}>
      {/* Primary */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"} />
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Language alternates */}
      {alternates.map((l) => (
        <link key={l.code} rel="alternate" hrefLang={l.code} href={absoluteUrl(canonical!, l.code)} />
      ))}
      {alternates.length > 0 && (
        <link rel="alternate" hrefLang="x-default" href={absoluteUrl(canonical!, DEFAULT_LANGUAGE)} />
      )}

      {/* Open Graph */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={ogType} />
      <meta property="og:locale" content={ogLocale} />
      {SUPPORTED_LANGUAGES.filter((l) => l.code !== lang).map((l) => (
        <meta key={l.code} property="og:locale:alternate" content={l.ogLocale} />
      ))}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={t("ogImageAlt")} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD Structured Data */}
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
};

export default SEO;
