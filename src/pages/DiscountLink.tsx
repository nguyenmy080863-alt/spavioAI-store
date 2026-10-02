import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useLocalizePath } from "@/i18n/LocaleLink";
import { storeCode } from "@/lib/discounts";

/** Share link /discount/CODE: remembers the code, then sends the visitor to the shop. */
const DiscountLink = () => {
  const { code = "" } = useParams();
  const { t } = useTranslation("shop");
  const localize = useLocalizePath();
  const clean = code.trim().slice(0, 40);

  useEffect(() => {
    if (!clean) return;
    storeCode(clean);
    toast.success(t("checkout.discountSaved", { code: clean }));
  }, [clean, t]);

  return <Navigate to={localize("/category/shop")} replace />;
};

export default DiscountLink;
