import { useTranslation } from "react-i18next";
import Header from "./header/Header";
import Footer from "./footer/Footer";
import SEO from "./SEO";

type Block = string | string[] | { [key: string]: Block };

const META_KEYS = new Set(["pageTitle", "title", "lastUpdated"]);

/** Renders a section's body: strings become paragraphs, arrays become lists, nested objects sub-sections. */
const BlockContent = ({ block }: { block: Block }) => {
  if (typeof block === "string") {
    return <p className="text-muted-foreground leading-relaxed">{block}</p>;
  }
  if (Array.isArray(block)) {
    return (
      <ul className="list-disc list-inside text-muted-foreground space-y-1">
        {block.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-4">
      {Object.entries(block).map(([key, value]) =>
        key === "title" ? null : typeof value === "object" && !Array.isArray(value) ? (
          <div key={key}>
            {typeof value.title === "string" && (
              <h3 className="text-xl font-light text-foreground mb-2">{value.title}</h3>
            )}
            <BlockContent block={value} />
          </div>
        ) : (
          <BlockContent key={key} block={value} />
        ),
      )}
    </div>
  );
};

interface LegalDocumentProps {
  /** Key in the "legal" namespace ("privacy" or "terms"). */
  doc: "privacy" | "terms";
  seoPage: string;
  canonical: string;
}

const LegalDocument = ({ doc, seoPage, canonical }: LegalDocumentProps) => {
  const { t } = useTranslation("legal");
  const content = t(doc, { returnObjects: true }) as Record<string, Block>;
  const sections = Object.entries(content).filter(([key]) => !META_KEYS.has(key));

  return (
    <div className="min-h-screen bg-background">
      <SEO page={seoPage} canonical={canonical} />
      <Header />

      <main className="pt-6">
        <article className="max-w-4xl mx-auto px-6 py-12">
          <header className="mb-12 text-center">
            <h1 className="text-4xl font-light text-foreground mb-4">{content.title as string}</h1>
            <p className="text-muted-foreground">{content.lastUpdated as string}</p>
          </header>

          <div className="prose prose-lg max-w-none space-y-8">
            {sections.map(([key, section]) => (
              <section key={key}>
                {typeof section === "object" && !Array.isArray(section) && typeof section.title === "string" && (
                  <h2 className="text-2xl font-light text-foreground mb-4">{section.title}</h2>
                )}
                <BlockContent block={section} />
              </section>
            ))}
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
};

export default LegalDocument;
