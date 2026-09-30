import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Link } from "@/i18n/LocaleLink";
import Header from "@/components/header/Header";
import Footer from "@/components/footer/Footer";
import SEO from "@/components/SEO";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation("legal");

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <SEO page="notFound" noindex />
      <Header />
      <main className="flex min-h-[50vh] items-center justify-center px-6 py-24">
        <div className="text-center">
          <p className="mb-2 text-6xl font-serif text-brand-gradient">{t("notFound.title")}</p>
          <h1 className="mb-4 text-2xl font-semibold text-foreground">{t("notFound.heading")}</h1>
          <p className="mb-8 text-muted-foreground">{t("notFound.message")}</p>
          <Link
            to="/"
            className="inline-block rounded-full bg-brand-gradient px-8 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-glow hover:brightness-110"
          >
            {t("notFound.returnHome")}
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default NotFound;
