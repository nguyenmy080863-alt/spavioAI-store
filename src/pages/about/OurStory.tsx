import { useTranslation } from "react-i18next";
import { Linkedin, ExternalLink } from "lucide-react";
import Header from "../../components/header/Header";
import Footer from "../../components/footer/Footer";
import PageHeader from "../../components/about/PageHeader";
import ContentSection from "../../components/about/ContentSection";
import AboutSidebar from "../../components/about/AboutSidebar";
import founderImage from "../../assets/brand/founder.png";
import SEO from "../../components/SEO";

const OurStory = () => {
  const { t } = useTranslation("about");

  return (
    <div className="min-h-screen bg-background">
      <SEO
        page="ourStory"
        canonical="/about/our-story"
      />
      <Header />
      
      <div className="flex">
        <div className="hidden lg:block">
          <AboutSidebar />
        </div>
        
        <main className="w-full lg:w-[70vw] lg:ml-auto px-6 md:px-12 pb-16 space-y-4">
          <PageHeader 
            title={t("ourStory.title")} 
            subtitle={t("ourStory.subtitle")}
          />
          
          {/* Founded on Passion */}
          <ContentSection title={t("ourStory.founders.title")}>
            <div className="bg-accent/5 border border-accent/20 p-6 sm:p-8 rounded-2xl">
              <p className="font-sans text-base sm:text-lg text-foreground font-normal leading-relaxed">
                "{t("ourStory.founders.content")}"
              </p>
            </div>
          </ContentSection>

          {/* Meet the Founder */}
          <ContentSection title={t("ourStory.foundersSection.title")}>
            <div className="group bg-card border border-border/80 rounded-2xl overflow-hidden hover:border-accent/60 transition-[border-color,box-shadow] duration-500 hover:shadow-glow grid md:grid-cols-2">
              <div className="relative w-full aspect-[4/5] overflow-hidden bg-secondary">
                <img
                  src={founderImage}
                  alt={t("ourStory.foundersSection.kris.name")}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1E1633]/70 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-6">
                  <span className="inline-block bg-brand-gradient px-3.5 py-1 text-[10px] tracking-[0.25em] uppercase text-white font-semibold rounded-full shadow-glow">
                    {t("ourStory.foundersSection.kris.role")}
                  </span>
                </div>
              </div>
              <div className="p-6 sm:p-10 space-y-4 flex flex-col justify-center">
                <h3 className="font-sans text-2xl sm:text-3xl font-semibold text-foreground">
                  {t("ourStory.foundersSection.kris.name")}
                </h3>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">
                  {t("ourStory.foundersSection.kris.education")}
                </p>
                <p className="font-sans text-foreground/85 text-base leading-relaxed">
                  {t("ourStory.foundersSection.kris.bio1")}
                </p>
                <p className="font-sans text-foreground/85 text-base leading-relaxed">
                  {t("ourStory.foundersSection.kris.bio2")}
                </p>
                <div className="pt-4 border-t border-border/40">
                  <a
                    href="https://www.linkedin.com/in/kristen149/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/30 text-accent hover:bg-accent hover:text-accent-foreground text-xs font-sans font-semibold uppercase tracking-wider rounded-full transition-colors duration-300"
                  >
                    <Linkedin size={15} />
                    <span>{t("ourStory.foundersSection.kris.linkedin")}</span>
                  </a>
                </div>
              </div>
            </div>
          </ContentSection>

          {/* Beauty, Innovation & Vision */}
          <ContentSection title={t("ourStory.foundersSection.vision.title")}>
            <div className="bg-secondary/40 border border-border/60 p-6 sm:p-8 rounded-2xl">
              <p className="font-sans text-foreground/85 leading-relaxed text-base sm:text-lg">
                {t("ourStory.foundersSection.vision.text")}
              </p>
            </div>
          </ContentSection>

          {/* Our Academy Section */}
          <ContentSection title={t("ourStory.academy.title")}>
            <div className="bg-accent/5 border border-accent/30 p-6 sm:p-8 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-xs">
              <div className="space-y-2 max-w-2xl">
                <p className="font-sans text-foreground/85 leading-relaxed text-base sm:text-lg">
                  {t("ourStory.academy.text")}
                </p>
              </div>
              <a
                href="https://spavioai.de"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-2.5 px-6 py-3.5 bg-brand-gradient text-white hover:brightness-110 text-xs font-sans font-semibold uppercase tracking-[0.2em] rounded-full shadow-glow transition-all duration-300 shadow-sm border border-transparent active:scale-[0.98]"
              >
                <span>{t("ourStory.academy.cta")}</span>
                <ExternalLink size={14} />
              </a>
            </div>
          </ContentSection>

          {/* Our Values */}
          <ContentSection title={t("ourStory.values.title")}>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="p-6 bg-card border border-border/70 rounded-2xl hover:border-accent/40 transition-all duration-300 space-y-2">
                <span className="font-serif text-2xl text-accent font-light block">01</span>
                <h3 className="font-sans text-xl font-medium text-foreground">
                  {t("ourStory.values.excellence.title")}
                </h3>
                <p className="font-sans text-foreground/80 text-sm sm:text-base leading-relaxed">
                  {t("ourStory.values.excellence.text")}
                </p>
              </div>

              <div className="p-6 bg-card border border-border/70 rounded-2xl hover:border-accent/40 transition-all duration-300 space-y-2">
                <span className="font-serif text-2xl text-accent font-light block">02</span>
                <h3 className="font-sans text-xl font-medium text-foreground">
                  {t("ourStory.values.authenticity.title")}
                </h3>
                <p className="font-sans text-foreground/80 text-sm sm:text-base leading-relaxed">
                  {t("ourStory.values.authenticity.text")}
                </p>
              </div>

              <div className="p-6 bg-card border border-border/70 rounded-2xl hover:border-accent/40 transition-all duration-300 space-y-2">
                <span className="font-serif text-2xl text-accent font-light block">03</span>
                <h3 className="font-sans text-xl font-medium text-foreground">
                  {t("ourStory.values.innovation.title")}
                </h3>
                <p className="font-sans text-foreground/80 text-sm sm:text-base leading-relaxed">
                  {t("ourStory.values.innovation.text")}
                </p>
              </div>
            </div>
          </ContentSection>

          {/* Our Heritage */}
          <ContentSection title={t("ourStory.heritage.title")}>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 sm:p-8 bg-secondary/30 border border-border/70 rounded-2xl hover:border-accent/40 transition-all duration-300 space-y-2">
                <h3 className="font-sans text-xl font-medium text-foreground">
                  {t("ourStory.heritage.handcrafted.title")}
                </h3>
                <p className="font-sans text-foreground/80 leading-relaxed text-sm sm:text-base">
                  {t("ourStory.heritage.handcrafted.text")}
                </p>
              </div>

              <div className="p-6 sm:p-8 bg-secondary/30 border border-border/70 rounded-2xl hover:border-accent/40 transition-all duration-300 space-y-2">
                <h3 className="font-sans text-xl font-normal text-foreground">
                  {t("ourStory.heritage.sustainable.title")}
                </h3>
                <p className="font-sans text-foreground/80 leading-relaxed text-sm sm:text-base">
                  {t("ourStory.heritage.sustainable.text")}
                </p>
              </div>
            </div>
          </ContentSection>
        </main>
      </div>
      
      <Footer />
    </div>
  );
};

export default OurStory;
