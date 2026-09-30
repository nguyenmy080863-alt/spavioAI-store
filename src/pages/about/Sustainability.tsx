import { useTranslation } from "react-i18next";
import Header from "../../components/header/Header";
import Footer from "../../components/footer/Footer";
import PageHeader from "../../components/about/PageHeader";
import ContentSection from "../../components/about/ContentSection";
import AboutSidebar from "../../components/about/AboutSidebar";
import SEO from "../../components/SEO";

const Sustainability = () => {
  const { t } = useTranslation("about");

  return (
    <div className="min-h-screen bg-background">
      <SEO
        page="sustainability"
        canonical="/about/sustainability"
      />
      <Header />
      
      <div className="flex">
        <div className="hidden lg:block">
          <AboutSidebar />
        </div>
        
        <main className="w-full lg:w-[70vw] lg:ml-auto px-6">
        <PageHeader 
          title={t("sustainability.title")} 
          subtitle={t("sustainability.subtitle")}
        />
        
        <ContentSection title={t("sustainability.commitment.title")}>
          <div className="grid md:grid-cols-2 gap-12 mb-16">
            <div className="space-y-6">
              <h3 className="text-xl font-light text-foreground">{t("sustainability.commitment.ethical.title")}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {t("sustainability.commitment.ethical.text")}
              </p>
            </div>
            <div className="space-y-6">
              <h3 className="text-xl font-light text-foreground">{t("sustainability.commitment.recyclable.title")}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {t("sustainability.commitment.recyclable.text")}
              </p>
            </div>
          </div>

          <div className="bg-muted/10 rounded-lg p-8">
            <h3 className="text-2xl font-light text-foreground mb-6">{t("sustainability.commitment.impactGoals.title")}</h3>
            <div className="grid md:grid-cols-3 gap-8">
              <div>
                <div className="text-3xl font-light text-primary mb-2">{t("sustainability.commitment.impactGoals.carbonNeutral.value")}</div>
                <p className="text-sm text-muted-foreground">{t("sustainability.commitment.impactGoals.carbonNeutral.label")}</p>
              </div>
              <div>
                <div className="text-3xl font-light text-primary mb-2">{t("sustainability.commitment.impactGoals.recycledPackaging.value")}</div>
                <p className="text-sm text-muted-foreground">{t("sustainability.commitment.impactGoals.recycledPackaging.label")}</p>
              </div>
              <div>
                <div className="text-3xl font-light text-primary mb-2">{t("sustainability.commitment.impactGoals.zeroWaste.value")}</div>
                <p className="text-sm text-muted-foreground">{t("sustainability.commitment.impactGoals.zeroWaste.label")}</p>
              </div>
            </div>
          </div>
        </ContentSection>

        <ContentSection title={t("sustainability.circularEconomy.title")}>
          <div className="space-y-8">
            <p className="text-lg text-muted-foreground leading-relaxed">
              {t("sustainability.circularEconomy.intro")}
            </p>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-lg font-light text-foreground">{t("sustainability.circularEconomy.lifetimeCare.title")}</h3>
                <p className="text-muted-foreground">
                  {t("sustainability.circularEconomy.lifetimeCare.text")}
                </p>
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-light text-foreground">{t("sustainability.circularEconomy.takeBack.title")}</h3>
                <p className="text-muted-foreground">
                  {t("sustainability.circularEconomy.takeBack.text")}
                </p>
              </div>
            </div>
          </div>
        </ContentSection>

        <ContentSection title={t("sustainability.certifications.title")}>
          <div className="space-y-8">
            <p className="text-muted-foreground leading-relaxed">
              {t("sustainability.certifications.intro")}
            </p>
            
            <div className="grid md:grid-cols-4 gap-8 items-center">
              <div className="h-16 w-32 bg-muted/10 rounded-lg flex items-center justify-center">
                <span className="text-xs text-muted-foreground">{t("sustainability.certifications.ce")}</span>
              </div>
              <div className="h-16 w-32 bg-muted/10 rounded-lg flex items-center justify-center">
                <span className="text-xs text-muted-foreground">{t("sustainability.certifications.rohs")}</span>
              </div>
              <div className="h-16 w-32 bg-muted/10 rounded-lg flex items-center justify-center">
                <span className="text-xs text-muted-foreground">{t("sustainability.certifications.weee")}</span>
              </div>
              <div className="h-16 w-32 bg-muted/10 rounded-lg flex items-center justify-center">
                <span className="text-xs text-muted-foreground">{t("sustainability.certifications.fscPackaging")}</span>
              </div>
            </div>
          </div>
        </ContentSection>
        </main>
      </div>
      
      <Footer />
    </div>
  );
};

export default Sustainability;
