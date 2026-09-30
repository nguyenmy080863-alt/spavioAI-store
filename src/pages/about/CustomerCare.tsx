import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import Header from "../../components/header/Header";
import Footer from "../../components/footer/Footer";
import PageHeader from "../../components/about/PageHeader";
import ContentSection from "../../components/about/ContentSection";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import AboutSidebar from "../../components/about/AboutSidebar";
import SEO from "../../components/SEO";
import { useToast } from "@/hooks/use-toast";

const CustomerCare = () => {
  const { t } = useTranslation("about");
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const recipient = "minh.kris.tran@spavioai.de";

    try {
      const response = await fetch(`https://formsubmit.co/ajax/${recipient}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`,
          email: email,
          orderNumber: orderNumber || "N/A",
          message: message,
          _subject: `Spavio AI Store Customer Inquiry: ${firstName} ${lastName}`,
          _template: "table",
        }),
      });

      if (response.ok) {
        toast({
          title: t("customerCare.form.successTitle"),
          description: t("customerCare.form.successText"),
        });
        setFirstName("");
        setLastName("");
        setEmail("");
        setOrderNumber("");
        setMessage("");
      } else {
        throw new Error("Failed to send message");
      }
    } catch {
      toast({
        title: t("customerCare.form.errorTitle"),
        description: t("customerCare.form.errorText"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const faqKeys = ["shipping", "returns", "warranty", "sizing", "care", "authentication"];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        page="customerCare"
        canonical="/about/customer-care"
      />
      <Header />
      
      <div className="flex">
        <div className="hidden lg:block">
          <AboutSidebar />
        </div>
        
        <main className="w-full lg:w-[70vw] lg:ml-auto px-6">
        <PageHeader 
          title={t("customerCare.title")} 
          subtitle={t("customerCare.subtitle")}
        />
        
        <ContentSection title={t("customerCare.contactInfo.title")}>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <h3 className="text-lg font-light text-foreground">{t("customerCare.contactInfo.phone.title")}</h3>
              <p className="text-muted-foreground">
                <a href="tel:+4917684941650" className="hover:text-foreground transition-colors">
                  {t("customerCare.contactInfo.phone.number")}
                </a>
              </p>
              <p className="text-sm text-muted-foreground">
                <Trans i18nKey="customerCare.contactInfo.phone.hours" t={t} />
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-light text-foreground">{t("customerCare.contactInfo.email.title")}</h3>
              <p className="text-muted-foreground">{t("customerCare.contactInfo.email.address")}</p>
              <p className="text-sm text-muted-foreground">{t("customerCare.contactInfo.email.response")}</p>
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-light text-foreground">{t("customerCare.contactInfo.liveChat.title")}</h3>
              <Button variant="outline" className="rounded-full" asChild>
                <a
                  href="https://wa.me/4917684941650"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("customerCare.contactInfo.liveChat.button")}
                </a>
              </Button>
              <p className="text-sm text-muted-foreground">{t("customerCare.contactInfo.liveChat.availability")}</p>
            </div>
          </div>
        </ContentSection>

        <ContentSection title={t("customerCare.faq.title")}>
          <Accordion type="single" collapsible className="space-y-4">
            {faqKeys.map((key) => (
              <AccordionItem key={key} value={key} className="border border-border rounded-lg px-6">
                <AccordionTrigger className="text-left hover:no-underline">
                  {t(`customerCare.faq.${key}.question`)}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {t(`customerCare.faq.${key}.answer`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ContentSection>

        <ContentSection title={t("customerCare.form.title")}>
          <div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-light text-foreground">{t("customerCare.form.firstName")}</label>
                  <Input
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="rounded-none"
                    placeholder={t("customerCare.form.firstNamePlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-light text-foreground">{t("customerCare.form.lastName")}</label>
                  <Input
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="rounded-none"
                    placeholder={t("customerCare.form.lastNamePlaceholder")}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-light text-foreground">{t("customerCare.form.email")}</label>
                <Input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-none"
                  placeholder={t("customerCare.form.emailPlaceholder")}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-light text-foreground">{t("customerCare.form.orderNumber")}</label>
                <Input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="rounded-none"
                  placeholder={t("customerCare.form.orderNumberPlaceholder")}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-light text-foreground">{t("customerCare.form.message")}</label>
                <Textarea 
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="rounded-none min-h-[120px]" 
                  placeholder={t("customerCare.form.messagePlaceholder")}
                />
              </div>
              
              <Button type="submit" disabled={isSubmitting} className="w-full rounded-full bg-brand-gradient text-white shadow-glow hover:brightness-110">
                {isSubmitting ? t("customerCare.form.sending") : t("customerCare.form.send")}
              </Button>
            </form>
          </div>
        </ContentSection>
        </main>
      </div>
      
      <Footer />
    </div>
  );
};

export default CustomerCare;
