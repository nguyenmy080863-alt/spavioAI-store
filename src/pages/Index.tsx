import Header from "../components/header/Header";
import Footer from "../components/footer/Footer";
import LargeHero from "../components/content/LargeHero";
import FiftyFiftySection from "../components/content/FiftyFiftySection";
import OneThirdTwoThirdsSection from "../components/content/OneThirdTwoThirdsSection";
import ProductCarousel from "../components/content/ProductCarousel";
import EditorialSection from "../components/content/EditorialSection";
import FomoCountdown from "../components/fomo/FomoCountdown";
import HeroBanner from "../components/content/HeroBanner";
import BrandUSPs from "../components/content/BrandUSPs";
import SEO, { SITE_URL, absoluteUrl } from "../components/SEO";
import { useLocale } from "@/i18n/LocaleLink";
import type { LanguageCode } from "@/i18n";
import { useTranslation } from "react-i18next";

const homepageJsonLd = (lang: LanguageCode, description: string) => [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "Spavio AI Store",
    url: SITE_URL,
    logo: `${SITE_URL}/spavioai-logo.png`,
    description,
    sameAs: ["https://www.instagram.com/spavioai", "https://spavioai.de"],
    contactPoint: {
      "@type": "ContactPoint",
      email: "info@spavioai.de",
      telephone: "+49-176-84941650",
      contactType: "customer service",
      availableLanguage: ["English", "German", "Vietnamese"],
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: "Glasergasse 18",
      addressLocality: "Neumarkt",
      postalCode: "92318",
      addressCountry: "DE",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${absoluteUrl("/", lang)}#website`,
    name: "Spavio AI Store",
    url: absoluteUrl("/", lang),
    inLanguage: lang,
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl("/category/shop", lang)}?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  },
];

const Index = () => {
  const { t } = useTranslation("home");
  const { t: tSeo } = useTranslation("seo");
  const lang = useLocale();
  return (
    <div className="min-h-screen bg-background">
      <SEO
        page="home"
        canonical="/"
        jsonLd={homepageJsonLd(lang, tSeo("organizationDescription"))}
      />
      <Header />

      <main>
        <HeroBanner />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-24 mb-16">
          <FomoCountdown />
        </div>

        <div className="my-24">
          <FiftyFiftySection />
        </div>

        <div className="my-24">
          <div className="px-6 mb-8">
            <h2 className="text-xl sm:text-2xl font-serif font-light text-foreground tracking-wide">{t("featured.title")}</h2>
          </div>
          <ProductCarousel />
        </div>

        <div className="my-24">
          <LargeHero />
        </div>

        <div className="my-24">
          <OneThirdTwoThirdsSection />
        </div>

        <div className="my-24">
          <BrandUSPs />
        </div>

        <div className="my-24">
          <EditorialSection />
        </div>


      </main>

      <Footer />
    </div>
  );
};

export default Index;
