import Header from "../components/header/Header";
import Footer from "../components/footer/Footer";
import SEO from "../components/SEO";
import { useTranslation } from "react-i18next";

const Impressum = () => {
  const { t } = useTranslation("legal");
  return (
    <div className="min-h-screen bg-background">
      <SEO
        page="impressum"
        canonical="/impressum"
      />
      <Header />

      <main className="pt-6">
        <div className="max-w-3xl mx-auto px-6 py-16">

          {/* Page title */}
          <header className="mb-12">
            <p className="text-[10px] tracking-[0.3em] uppercase text-accent font-semibold mb-3">{t("impressumEyebrow")}</p>
            <h1 className="text-4xl sm:text-5xl font-serif font-light text-foreground tracking-wide mb-4">
              Impressum
            </h1>
            <div className="w-12 h-px bg-accent/60 mt-6" />
          </header>

          <div className="space-y-10 font-sans text-sm sm:text-base text-foreground/80 leading-relaxed">

            {/* Angaben gemäß § 5 TMG */}
            <section className="space-y-3">
              <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-foreground/50">
                Angaben gemäß § 5 TMG
              </h2>
              <div className="border-l-2 border-accent/30 pl-5 space-y-1">
                <p className="font-medium text-foreground">Minh Khue (Kris) Tran</p>
                <p>Spavio AI</p>
                <p>Glasergasse 18</p>
                <p>92318 Neumarkt</p>
                <p>Germany</p>
              </div>
            </section>

            {/* Kontakt */}
            <section className="space-y-3">
              <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-foreground/50">
                Kontakt
              </h2>
              <div className="border-l-2 border-accent/30 pl-5 space-y-1">
                <p>
                  <span className="text-foreground/50 mr-2">Telefon:</span>
                  <a
                    href="tel:+4917684941650"
                    className="hover:text-accent transition-colors duration-200"
                  >
                    +49 176 84941650
                  </a>
                </p>
                <p>
                  <span className="text-foreground/50 mr-2">E-Mail:</span>
                  <a
                    href="mailto:info@spavioai.de"
                    className="hover:text-accent transition-colors duration-200"
                  >
                    info@spavioai.de
                  </a>
                </p>
              </div>
            </section>

            {/* Redaktionell verantwortlich */}
            <section className="space-y-3">
              <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-foreground/50">
                Redaktionell verantwortlich
              </h2>
              <div className="border-l-2 border-accent/30 pl-5 space-y-1">
                <p className="font-medium text-foreground">Minh Khue (Kris) Tran</p>
                <p>Glasergasse 18</p>
                <p>92318 Neumarkt</p>
              </div>
            </section>

            {/* EU-Streitschlichtung */}
            <section className="space-y-3">
              <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-foreground/50">
                EU-Streitschlichtung
              </h2>
              <div className="border-l-2 border-accent/30 pl-5">
                <p>
                  Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
                  <a
                    href="https://ec.europa.eu/consumers/odr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    https://ec.europa.eu/consumers/odr
                  </a>
                </p>
              </div>
            </section>

            {/* Verbraucherstreitbeilegung */}
            <section className="space-y-3">
              <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-foreground/50">
                Verbraucherstreitbeilegung / Universalschlichtungsstelle
              </h2>
              <div className="border-l-2 border-accent/30 pl-5">
                <p className="text-foreground/70">
                  Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren
                  vor einer Verbraucherschlichtungsstelle teilzunehmen.
                </p>
              </div>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Impressum;
