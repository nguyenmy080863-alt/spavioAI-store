import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Link } from "@/i18n/LocaleLink";
import { useConsent } from "@/context/ConsentContext";
import { SUPPORTED_LANGUAGES, getLangFromPath, localizePath, stripLocale } from "@/i18n";
import StoreLogo from "@/components/StoreLogo";

const Footer = () => {
  const { t } = useTranslation("common");
  const { pathname, search } = useLocation();
  const currentLang = getLangFromPath(pathname);
  const { openSettings } = useConsent();

  return (
    <footer className="w-full bg-secondary/40 text-foreground pt-20 pb-8 px-8 border-t border-accent/10 mt-32 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-16">
          {/* Brand - Left side */}
          <div className="space-y-6">
            <StoreLogo heightClass="h-8" />
            <p className="text-xs sm:text-sm font-light text-muted-foreground leading-relaxed max-w-sm">
              {t("brand.tagline")}
            </p>

            {/* Contact Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs sm:text-sm font-light text-muted-foreground">
              <div>
                <p className="font-semibold text-foreground tracking-wider uppercase text-[10px] mb-2">{t("footer.visitUs")}</p>
                <p>Glasergasse 18</p>
                <p>92318 Neumarkt</p>
              </div>
              <div>
                <p className="font-semibold text-foreground tracking-wider uppercase text-[10px] mb-2">{t("footer.contact")}</p>
                <p><a href="tel:+4917684941650" className="hover:text-accent transition-colors">+49 176 84941650</a></p>
                <p className="hover:text-accent transition-colors"><a href="mailto:info@spavioai.de">info@spavioai.de</a></p>
              </div>
            </div>
          </div>

          {/* Link lists - Right side */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
            {/* Shop */}
            <div>
              <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-foreground mb-4">{t("footer.shop")}</h4>
              <ul className="space-y-2.5 text-xs sm:text-sm">
                <li><Link to="/category/skincare-devices" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.skincareDevices")}</Link></li>
                <li><Link to="/category/hair-removal" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.hairRemoval")}</Link></li>
                <li><Link to="/category/hair-styling-and-care" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.hairStylingCare")}</Link></li>
                <li><Link to="/category/body-and-wellness" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.bodyWellness")}</Link></li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-foreground mb-4">{t("footer.support")}</h4>
              <ul className="space-y-2.5 text-xs sm:text-sm">
                <li><Link to="/about/device-guide" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.deviceGuide")}</Link></li>
                <li><Link to="/journal" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.journal")}</Link></li>
                <li><Link to="/warranty" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.warranty")}</Link></li>
                <li><Link to="/about/customer-care" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.returns")}</Link></li>
                <li><Link to="/orders/track" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.trackOrder")}</Link></li>
                <li><Link to="/about/customer-care" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.shipping")}</Link></li>
                <li><Link to="/about/customer-care" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.contact")}</Link></li>
              </ul>
            </div>

            {/* Connect */}
            <div className="col-span-2 md:col-span-1">
              <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-foreground mb-4">{t("footer.connect")}</h4>
              <ul className="space-y-2.5 text-xs sm:text-sm">
                <li><a href="https://www.instagram.com/spavioai" target="_blank" rel="noopener noreferrer" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">Instagram</a></li>
                <li><a href="https://spavioai.de" target="_blank" rel="noopener noreferrer" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.forStudios")}</a></li>
                <li><a href="#" className="font-light text-muted-foreground hover:text-accent transition-colors duration-200">{t("footer.newsletter")}</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom section - separator */}
        <div className="border-t border-accent/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-light text-muted-foreground">
          <p className="mb-0 text-center md:text-left">
            {t("footer.rights")}
          </p>
          <nav aria-label={t("language.label")} className="flex items-center gap-3">
            {SUPPORTED_LANGUAGES.map((language) => (
              <a
                key={language.code}
                href={localizePath(stripLocale(pathname), language.code) + search}
                hrefLang={language.code}
                lang={language.code}
                aria-current={language.code === currentLang ? "true" : undefined}
                className={language.code === currentLang ? "text-foreground font-medium" : "hover:text-accent transition-colors duration-200"}
              >
                {language.label}
              </a>
            ))}
          </nav>
          <div className="flex space-x-6">
            <Link to="/privacy-policy" className="hover:text-accent transition-colors duration-200">
              {t("footer.privacyPolicy")}
            </Link>
            <Link to="/terms-of-service" className="hover:text-accent transition-colors duration-200">
              {t("footer.termsOfService")}
            </Link>
            <Link to="/impressum" className="hover:text-accent transition-colors duration-200">
              Impressum
            </Link>
            <button type="button" onClick={openSettings} className="hover:text-accent transition-colors duration-200">
              {t("footer.cookieSettings")}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
