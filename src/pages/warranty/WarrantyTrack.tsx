import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@/i18n/LocaleLink";
import Header from "@/components/header/Header";
import Footer from "@/components/footer/Footer";
import SEO from "@/components/SEO";
import TicketView from "@/components/warranty/TicketView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { fetchPublicTicket } from "@/lib/warranty";

/** Ticket lookup by ticket number + email; signed-in owners can open their own tickets without the email. */
const WarrantyTrack = () => {
  const { t } = useTranslation("shop");
  const { user, loading } = useAdminAuth();
  const [params, setParams] = useSearchParams();

  const ticketParam = (params.get("ticket") ?? "").trim().toUpperCase();
  const emailParam = (params.get("email") ?? "").trim();
  const [ticketInput, setTicketInput] = useState(ticketParam);
  const [emailInput, setEmailInput] = useState(emailParam);

  const email = emailParam || (user?.email ?? "");
  const enabled = !!ticketParam && !loading;

  const { data: ticket, isFetching } = useQuery({
    queryKey: ["public-ticket", ticketParam, email],
    queryFn: () => fetchPublicTicket(ticketParam, email),
    enabled,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO page="warrantyTrack" canonical="/warranty/track" noindex />
      <Header />
      <main className="flex-1 px-6 py-16 max-w-2xl mx-auto w-full">
        <h1 className="text-3xl font-serif text-foreground mb-3">{t("warranty.track.title")}</h1>
        <p className="text-sm text-muted-foreground mb-10">{t("warranty.track.intro")}</p>

        {ticket ? (
          <div className="space-y-8">
            <TicketView ticket={ticket} email={email} />
            <Button variant="outline" size="sm" onClick={() => setParams({})}>
              {t("warranty.track.another")}
            </Button>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              const next: Record<string, string> = { ticket: ticketInput.trim() };
              if (emailInput.trim()) next.email = emailInput.trim();
              setParams(next);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="t-number">{t("warranty.track.ticketNumber")}</Label>
              <Input
                id="t-number"
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
                placeholder="WT-00001"
                required
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-email">{t("warranty.track.email")}</Label>
              <Input
                id="t-email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={user?.email}
                required={!user}
                maxLength={255}
              />
            </div>
            {enabled && !isFetching && ticket === null && (
              <p className="text-sm text-destructive">{t("warranty.track.notFound")}</p>
            )}
            <Button type="submit" disabled={isFetching}>
              {isFetching ? t("warranty.track.looking") : t("warranty.track.lookup")}
            </Button>
          </form>
        )}

        <p className="text-sm mt-10">
          <Link to="/warranty" className="text-accent">
            {t("warranty.newLink")}
          </Link>
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default WarrantyTrack;
