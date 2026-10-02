import { Link, useLocaleNavigate, useLocalizePath } from "@/i18n/LocaleLink";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMyTickets } from "@/lib/warranty";
import Header from "@/components/header/Header";
import Footer from "@/components/footer/Footer";
import { Button } from "@/components/ui/button";
import { useAdminAuth, ROLE_LABELS } from "@/context/AdminAuthContext";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/data/products";
import SEO from "@/components/SEO";
import { useTranslation } from "react-i18next";
import { useProductText } from "@/i18n/useProductText";

const Account = () => {
  const { user, isAdmin, roles, loading, signOut } = useAdminAuth();
  const { items, totalItems, subtotal } = useCart();
  const navigate = useLocaleNavigate();
  const localize = useLocalizePath();
  const { t } = useTranslation("shop");
  const { localize: localizeProduct } = useProductText();

  const { data: tickets = [] } = useQuery({
    queryKey: ["my-warranty-tickets", user?.id],
    queryFn: () => fetchMyTickets(user!.id),
    enabled: !!user,
    retry: false,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SEO page="account" noindex />
        <p className="text-sm text-muted-foreground">{t("account.loading")}</p>
      </div>
    );
  }

  if (!user) return <Navigate to={localize("/login")} replace />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        page="account"
        noindex={true}
      />
      <Header />
      <main className="flex-1 px-6 py-16 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-light text-foreground mb-2">{t("account.title")}</h1>
        <p className="text-sm text-muted-foreground mb-10">{user.email}</p>

        {isAdmin && (
          <div className="border border-border p-6 mb-8">
            <p className="text-sm text-foreground mb-1">{t("account.adminAccess")}</p>
            <p className="text-xs text-muted-foreground mb-4">
              {roles.map((role) => ROLE_LABELS[role]).join(" · ")}
            </p>
            <Button size="sm" asChild>
              <Link to="/admin">{t("account.openAdmin")}</Link>
            </Button>
          </div>
        )}

        <div className="border border-border p-6 mb-8">
          <p className="text-sm text-foreground mb-1">{t("account.savedBag")}</p>
          <p className="text-xs text-muted-foreground mb-4">
            {totalItems > 0
              ? t("account.savedSummary", { count: totalItems, total: formatPrice(subtotal) })
              : t("account.emptyBag")}
          </p>
          <ul className="space-y-1 mb-4">
            {items.map(localizeProduct).map((item) => (
              <li key={item.id} className="text-xs text-muted-foreground">
                {item.quantity} × {item.name}
              </li>
            ))}
          </ul>
          {totalItems > 0 && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/checkout">{t("account.goToCheckout")}</Link>
            </Button>
          )}
        </div>

        <div className="border border-border p-6 mb-8">
          <p className="text-sm text-foreground mb-1">{t("orders.account.title")}</p>
          <p className="text-xs text-muted-foreground mb-4">{t("orders.account.text")}</p>
          <Button size="sm" variant="outline" asChild>
            <Link to="/account/orders">{t("orders.account.open")}</Link>
          </Button>
        </div>

        <div className="border border-border p-6 mb-8">
          <p className="text-sm text-foreground mb-3">{t("warranty.account.title")}</p>
          {tickets.length === 0 ? (
            <p className="text-xs text-muted-foreground mb-4">{t("warranty.account.empty")}</p>
          ) : (
            <ul className="divide-y divide-border mb-4">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <span className="min-w-0">
                    <span className="text-foreground">{ticket.ticket_number}</span>
                    <span className="text-muted-foreground"> · {ticket.subject}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-muted-foreground">{t(`warranty.ticket.status.${ticket.status}`)}</span>
                    <Link to={`/warranty/track?ticket=${ticket.ticket_number}`} className="text-accent">
                      {t("warranty.account.view")}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link to="/warranty">{t("warranty.account.open")}</Link>
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await signOut();
            navigate("/", { replace: true });
          }}
        >
          {t("account.signOut")}
        </Button>
      </main>
      <Footer />
    </div>
  );
};

export default Account;
