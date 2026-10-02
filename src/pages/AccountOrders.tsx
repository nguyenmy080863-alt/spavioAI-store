import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocalizePath } from "@/i18n/LocaleLink";
import Header from "@/components/header/Header";
import Footer from "@/components/footer/Footer";
import SEO from "@/components/SEO";
import OrderCard from "@/components/orders/OrderCard";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { fetchMyOrders } from "@/lib/accountOrders";

/** Order history of a signed-in customer. */
const AccountOrders = () => {
  const { t } = useTranslation("shop");
  const { user, loading } = useAdminAuth();
  const localize = useLocalizePath();

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["my-orders", user?.id],
    queryFn: fetchMyOrders,
    enabled: !!user,
    retry: false,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SEO page="accountOrders" noindex />
        <p className="text-sm text-muted-foreground">{t("account.loading")}</p>
      </div>
    );
  }
  if (!user) return <Navigate to={localize("/login")} replace />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO page="accountOrders" noindex />
      <Header />
      <main className="flex-1 px-6 py-16 max-w-2xl mx-auto w-full">
        <p className="text-xs text-muted-foreground mb-2">
          <Link to="/account">{t("account.title")}</Link>
        </p>
        <h1 className="text-2xl font-light text-foreground mb-2">{t("orders.title")}</h1>
        <p className="text-sm text-muted-foreground mb-10">{t("orders.intro")}</p>

        {isLoading && <p className="text-sm text-muted-foreground">{t("account.loading")}</p>}
        {error && <p className="text-sm text-destructive">{t("orders.loadError")}</p>}
        {!isLoading && !error && orders.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("orders.empty")}</p>
        )}

        <div className="space-y-6">
          {orders.map((order) => (
            <OrderCard key={order.order_number} order={order} email={user.email ?? ""} />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AccountOrders;
