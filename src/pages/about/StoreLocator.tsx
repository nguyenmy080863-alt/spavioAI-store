import { useTranslation } from "react-i18next";
import Header from "../../components/header/Header";
import Footer from "../../components/footer/Footer";
import PageHeader from "../../components/about/PageHeader";
import ContentSection from "../../components/about/ContentSection";
import StoreMap from "../../components/about/StoreMap";
import { Button } from "../../components/ui/button";
import AboutSidebar from "../../components/about/AboutSidebar";
import SEO from "../../components/SEO";

const StoreLocator = () => {
  const { t } = useTranslation("about");


  const stores = [
    {
      key: "neumarktShowroom",
      address: "Glasergasse 18, 92318 Neumarkt",
      phone: "+49 176 84941650",
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        page="storeLocator"
        canonical="/about/store-locator"
      />
      <Header />
      
      <div className="flex">
        <div className="hidden lg:block">
          <AboutSidebar />
        </div>
        
        <main className="w-full lg:w-[70vw] lg:ml-auto px-6">
        <PageHeader 
          title={t("storeLocator.title")} 
          subtitle={t("storeLocator.subtitle")}
        />
        
        <ContentSection title={t("storeLocator.mapSection.title")}>
          <StoreMap />
        </ContentSection>

        <ContentSection title={t("storeLocator.locationsSection.title")}>
          <div className="grid gap-8">
            {stores.map((store) => {
              const services = t(`storeLocator.stores.${store.key}.services`, { returnObjects: true }) as string[];
              return (
                <div key={store.key} className="bg-background rounded-lg p-8 border border-border">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h3 className="text-xl font-light text-foreground">{t(`storeLocator.stores.${store.key}.name`)}</h3>
                      <div className="space-y-2 text-muted-foreground">
                        <p>{store.address}</p>
                        <p>{store.phone}</p>
                        <p>{t(`storeLocator.stores.${store.key}.hours`)}</p>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <Button variant="outline" className="rounded-full">
                          {t("storeLocator.locationsSection.getDirections")}
                        </Button>
                        <Button className="rounded-full">
                          {t("storeLocator.locationsSection.bookAppointment")}
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h4 className="text-lg font-light text-foreground">{t("storeLocator.locationsSection.availableServices")}</h4>
                      <ul className="grid grid-cols-2 gap-2">
                        {services.map((service, serviceIndex) => (
                          <li key={serviceIndex} className="text-sm text-muted-foreground flex items-center">
                            <span className="w-2 h-2 bg-primary rounded-full mr-3 flex-shrink-0"></span>
                            {service}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ContentSection>

        <ContentSection title={t("storeLocator.privateAppointments.title")}>
          <div className="space-y-6">
            <p className="text-lg text-muted-foreground leading-relaxed">
              {t("storeLocator.privateAppointments.intro")}
            </p>
            
            <div className="grid md:grid-cols-3 gap-8 mt-12">
              <div className="space-y-3">
                <h4 className="text-lg font-light text-foreground">{t("storeLocator.privateAppointments.deviceDemo.title")}</h4>
                <p className="text-muted-foreground text-sm">
                  {t("storeLocator.privateAppointments.deviceDemo.text")}
                </p>
              </div>
              <div className="space-y-3">
                <h4 className="text-lg font-light text-foreground">{t("storeLocator.privateAppointments.customStyles.title")}</h4>
                <p className="text-muted-foreground text-sm">
                  {t("storeLocator.privateAppointments.customStyles.text")}
                </p>
              </div>
              <div className="space-y-3">
                <h4 className="text-lg font-light text-foreground">{t("storeLocator.privateAppointments.expertServices.title")}</h4>
                <p className="text-muted-foreground text-sm">
                  {t("storeLocator.privateAppointments.expertServices.text")}
                </p>
              </div>
            </div>
            
            <div className="pt-8">
              <Button size="lg" className="rounded-full">
                {t("storeLocator.privateAppointments.scheduleButton")}
              </Button>
            </div>
          </div>
        </ContentSection>

        <ContentSection title={t("storeLocator.virtualConsultations.title")}>
          <div className="bg-muted/10 rounded-lg p-8">
            <h3 className="text-xl font-light text-foreground mb-4">{t("storeLocator.virtualConsultations.cantVisit")}</h3>
            <p className="text-muted-foreground mb-6">
              {t("storeLocator.virtualConsultations.text")}
            </p>
            <Button variant="outline" className="rounded-full">
              {t("storeLocator.virtualConsultations.bookButton")}
            </Button>
          </div>
        </ContentSection>
        </main>
      </div>
      
      <Footer />
    </div>
  );
};

export default StoreLocator;
