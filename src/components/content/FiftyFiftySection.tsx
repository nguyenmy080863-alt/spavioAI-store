import skincareDevicesImage from "@/assets/brand/skincare-devices.svg";
import dryerImage from "@/assets/products/aura-ionic-dryer.svg";
import { Link } from "@/i18n/LocaleLink";
import { useTranslation } from "react-i18next";

const FiftyFiftySection = () => {
  const { t } = useTranslation("home");
  return (
    <section className="w-full mb-16 px-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Link to="/category/skincare-devices" className="block">
            <div className="w-full aspect-square mb-3 overflow-hidden rounded-2xl">
              <img
                src={skincareDevicesImage}
                alt={t("fiftyFifty.skincare.alt")}
                loading="lazy"
                width={1024}
                height={1024}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>
          </Link>
          <div className="">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {t("fiftyFifty.skincare.title")}
            </h3>
            <p className="text-sm font-light text-foreground">
              {t("fiftyFifty.skincare.subtitle")}
            </p>
          </div>
        </div>

        <div>
          <Link to="/category/hair-styling-and-care" className="block">
            <div className="w-full aspect-square mb-3 overflow-hidden rounded-2xl">
              <img
                src={dryerImage}
                alt={t("fiftyFifty.hair.alt")}
                loading="lazy"
                width={1024}
                height={1024}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>
          </Link>
          <div className="">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {t("fiftyFifty.hair.title")}
            </h3>
            <p className="text-sm font-light text-foreground">
              {t("fiftyFifty.hair.subtitle")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FiftyFiftySection;
