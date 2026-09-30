import { Link } from "@/i18n/LocaleLink";
import { useTranslation } from "react-i18next";
import Header from "../../components/header/Header";
import Footer from "../../components/footer/Footer";
import PageHeader from "../../components/about/PageHeader";
import ContentSection from "../../components/about/ContentSection";
import { Button } from "../../components/ui/button";
import AboutSidebar from "../../components/about/AboutSidebar";
import SEO from "../../components/SEO";

const goalKeys = ["antiAging", "clearSkin", "smoothSkin", "hairHealth"] as const;
const goalLinks: Record<(typeof goalKeys)[number], string> = {
  antiAging: "/category/anti-aging",
  clearSkin: "/product/sonic-cleanse-brush",
  smoothSkin: "/category/hair-removal",
  hairHealth: "/category/hair-styling-and-care",
};

const tableRows = ["ledMask", "microcurrent", "rf", "ipl", "dryer", "massageGun"];
const safetyKeys = ["patchTest", "pregnancy", "implants", "skinConditions"];

const DeviceGuide = () => {
  const { t } = useTranslation("about");

  return (
    <div className="min-h-screen bg-background">
      <SEO
        page="deviceGuide"
        canonical="/about/device-guide"
      />
      <Header />

      <div className="flex">
        <div className="hidden lg:block">
          <AboutSidebar />
        </div>

        <main className="w-full lg:w-[70vw] lg:ml-auto px-6">
          <PageHeader title={t("deviceGuide.title")} subtitle={t("deviceGuide.subtitle")} />

          <ContentSection title={t("deviceGuide.goals.title")}>
            <div className="space-y-8">
              <div className="bg-secondary/50 rounded-2xl p-8">
                <h3 className="text-xl font-light text-foreground mb-6">{t("deviceGuide.goals.matchTitle")}</h3>
                <div className="grid md:grid-cols-2 gap-8">
                  {goalKeys.map((key) => (
                    <Link key={key} to={goalLinks[key]} className="space-y-3 group block">
                      <h4 className="font-semibold text-foreground group-hover:text-accent transition-colors">
                        {t(`deviceGuide.goals.${key}.title`)}
                      </h4>
                      <p className="text-muted-foreground">{t(`deviceGuide.goals.${key}.text`)}</p>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-brand-gradient text-white">
                      <th className="p-3 text-left font-semibold">{t("deviceGuide.table.device")}</th>
                      <th className="p-3 text-left font-semibold">{t("deviceGuide.table.technology")}</th>
                      <th className="p-3 text-left font-semibold">{t("deviceGuide.table.session")}</th>
                      <th className="p-3 text-left font-semibold">{t("deviceGuide.table.frequency")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((rowKey) => (
                      <tr key={rowKey} className="border-t border-border hover:bg-secondary/40">
                        <td className="p-3 font-medium">{t(`deviceGuide.table.rows.${rowKey}.device`)}</td>
                        <td className="p-3 text-muted-foreground">{t(`deviceGuide.table.rows.${rowKey}.technology`)}</td>
                        <td className="p-3 text-muted-foreground">{t(`deviceGuide.table.rows.${rowKey}.session`)}</td>
                        <td className="p-3 text-muted-foreground">{t(`deviceGuide.table.rows.${rowKey}.frequency`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ContentSection>

          <ContentSection title={t("deviceGuide.routine.title")}>
            <div className="grid md:grid-cols-2 gap-12">
              {(["morning", "evening"] as const).map((part) => (
                <div key={part} className="space-y-6">
                  <h3 className="text-xl font-light text-foreground">{t(`deviceGuide.routine.${part}.title`)}</h3>
                  <div className="space-y-4">
                    {(["step1", "step2", "step3"] as const).map((step) => (
                      <div key={step} className="flex justify-between gap-6 py-2 border-b border-border">
                        <span className="text-muted-foreground">{t(`deviceGuide.routine.${part}.${step}.label`)}</span>
                        <span className="text-foreground text-right">{t(`deviceGuide.routine.${part}.${step}.value`)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ContentSection>

          <ContentSection title={t("deviceGuide.safety.title")}>
            <ul className="grid md:grid-cols-2 gap-4">
              {safetyKeys.map((key) => (
                <li key={key} className="rounded-2xl border border-border p-5 bg-card">
                  <h4 className="font-semibold text-foreground mb-2">{t(`deviceGuide.safety.${key}.title`)}</h4>
                  <p className="text-sm text-muted-foreground">{t(`deviceGuide.safety.${key}.text`)}</p>
                </li>
              ))}
            </ul>
          </ContentSection>

          <ContentSection title={t("deviceGuide.needHelp.title")}>
            <div className="space-y-6">
              <p className="text-muted-foreground">{t("deviceGuide.needHelp.text")}</p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button variant="outline" className="rounded-full" asChild>
                  <Link to="/category/shop">{t("deviceGuide.needHelp.browse")}</Link>
                </Button>
                <Button className="rounded-full bg-brand-gradient text-white shadow-glow hover:brightness-110" asChild>
                  <Link to="/about/customer-care">{t("deviceGuide.needHelp.consultation")}</Link>
                </Button>
              </div>
            </div>
          </ContentSection>
        </main>
      </div>

      <Footer />
    </div>
  );
};

export default DeviceGuide;
