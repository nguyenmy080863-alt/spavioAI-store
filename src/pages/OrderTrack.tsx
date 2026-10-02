import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@/i18n/LocaleLink";
import Header from "@/components/header/Header";
import Footer from "@/components/footer/Footer";
import SEO from "@/components/SEO";
import OrderCard from "@/components/orders/OrderCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { fetchOrderByNumber } from "@/lib/accountOrders";

/** Order lookup by order number + email, for guests (signed-in owners can skip the email). */
const OrderTrack = () => {
  const { t } = useTranslation("shop");
  const { user, loading } = useAdminAuth();
  const [params, setParams] = useSearchParams();

  const orderParam = (params.get("order") ?? "").trim().toUpperCase();
  const emailParam = (params.get("email") ?? "").trim();
  const [orderInput, setOrderInput] = useState(orderParam);
  const [emailInput, setEmailInput] = useState(emailParam);

  const email = emailParam || (user?.email ?? "");
  const enabled = !!orderParam && !loading;

  const { data: order, isFetching } = useQuery({
    queryKey: ["order-track", orderParam, email],
    queryFn: () => fetchOrderByNumber(orderParam, email),
    enabled,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO page="orderTrack" noindex />
      <Header />
      <main className="flex-1 px-6 py-16 max-w-2xl mx-auto w-full">
        <h1 className="text-3xl font-serif text-foreground mb-3">{t("orders.track.title")}</h1>
        <p className="text-sm text-muted-foreground mb-10">{t("orders.track.intro")}</p>

        {order ? (
          <div className="space-y-6">
            <OrderCard order={order} email={email} />
            <Button variant="outline" size="sm" onClick={() => setParams({})}>
              {t("orders.track.another")}
            </Button>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              const next: Record<string, string> = { order: orderInput.trim() };
              if (emailInput.trim()) next.email = emailInput.trim();
              setParams(next);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="o-number">{t("orders.track.orderNumber")}</Label>
              <Input
                id="o-number"
                value={orderInput}
                onChange={(e) => setOrderInput(e.target.value)}
                placeholder="SO-00042"
                required
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-email">{t("orders.track.email")}</Label>
              <Input
                id="o-email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={user?.email}
                required={!user}
                maxLength={255}
              />
            </div>
            {enabled && !isFetching && order === null && (
              <p className="text-sm text-destructive">{t("orders.track.notFound")}</p>
            )}
            <Button type="submit" disabled={isFetching}>
              {isFetching ? t("orders.track.looking") : t("orders.track.lookup")}
            </Button>
          </form>
        )}

        <p className="text-sm mt-10">
          <Link to="/warranty" className="text-accent">
            {t("orders.track.warrantyLink")}
          </Link>
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default OrderTrack;
