import iplImage from "@/assets/products/silk-ipl.svg";
import deviceStudioImage from "@/assets/brand/device-studio.jpg";
import { Link } from "@/i18n/LocaleLink";
import { useTranslation } from "react-i18next";

const OneThirdTwoThirdsSection = () => {
  const { t } = useTranslation("home");
  return (
    <section className="w-full mb-16 px-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Link to="/category/hair-removal" className="block">
            <div className="w-full h-[500px] lg:h-[800px] mb-3 overflow-hidden rounded-2xl">
              <img
                src={iplImage}
                alt={t("oneThirdTwoThirds.hairRemoval.alt")}
                loading="lazy"
                width={1024}
                height={1024}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>
          </Link>
          <div className="">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {t("oneThirdTwoThirds.hairRemoval.title")}
            </h3>
            <p className="text-sm font-light text-foreground">
              {t("oneThirdTwoThirds.hairRemoval.subtitle")}
            </p>
          </div>
        </div>

        <div className="lg:col-span-2">
          <Link to="/category/body-and-wellness" className="block">
            <div className="w-full h-[500px] lg:h-[800px] mb-3 overflow-hidden rounded-2xl">
              <img
                src={deviceStudioImage}
                alt={t("oneThirdTwoThirds.clinicAtHome.alt")}
                loading="lazy"
                width={1024}
                height={1024}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>
          </Link>
          <div className="">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {t("oneThirdTwoThirds.clinicAtHome.title")}
            </h3>
            <p className="text-sm font-light text-foreground">
              {t("oneThirdTwoThirds.clinicAtHome.subtitle")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OneThirdTwoThirdsSection;
