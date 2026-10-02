import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import Header from "@/components/header/Header";
import Footer from "@/components/footer/Footer";
import SEO from "@/components/SEO";
import { Link } from "@/i18n/LocaleLink";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatPrice } from "@/data/products";
import { fetchDraftByToken, placeOrderFromDraft } from "@/lib/drafts";
import { recordOrderPayment } from "@/lib/checkout";

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || "";

/** Payment page opened from a payment link sent by the shop (/pay/<secret token>). */
const PayDraft = () => {
  const { token = "" } = useParams();
  const { t, i18n } = useTranslation("shop");

  const { data: draft, isLoading, refetch } = useQuery({
    queryKey: ["pay-draft", token],
    queryFn: () => fetchDraftByToken(token),
    retry: false,
  });

  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Germany");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);
  const placed = useRef<{ order_number: string; customer_email: string } | null>(null);

  useEffect(() => {
    if (!draft) return;
    setPhone(draft.customer_phone ?? "");
    setAddress(draft.shipping_address?.address ?? "");
    setPostalCode(draft.shipping_address?.postal_code ?? "");
    setCity(draft.shipping_address?.city ?? "");
    setCountry(draft.shipping_address?.country || "Germany");
  }, [draft]);

  const date = (value: string | null) => (value ? new Date(value).toLocaleString(i18n.language) : "");
  const pricing = draft?.pricing;
  const amount = draft?.amount_due ?? pricing?.amount_charged ?? 0;
  const canPay = draft && (draft.status === "open" || draft.status === "awaiting_payment");

  const startPayment = async () => {
    setError(null);
    if (!address.trim() || !postalCode.trim() || !city.trim()) {
      const message = t("pay.fillAddress");
      setError(message);
      throw new Error(message);
    }
    try {
      const result = await placeOrderFromDraft(
        token,
        phone,
        { address: address.trim(), postal_code: postalCode.trim(), city: city.trim(), country: country.trim() },
        consent,
      );
      placed.current = result;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO title={t("pay.title")} description={t("pay.intro", { name: "" })} noindex />
      <Header />
      <main className="flex-1 px-6 py-16 max-w-2xl mx-auto w-full">
        <h1 className="text-3xl font-serif text-foreground mb-3">{t("pay.title")}</h1>

        {isLoading && <p className="text-sm text-muted-foreground">{t("account.loading")}</p>}
        {!isLoading && !draft && <p className="text-sm text-destructive">{t("pay.notFound")}</p>}

        {thanks && (
          <div className="border border-border p-6 space-y-3">
            <h2 className="text-lg font-light text-foreground">{t("pay.thanksTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("pay.thanks", { number: thanks })}</p>
            <Link to={`/orders/track?order=${thanks}&email=${encodeURIComponent(placed.current?.customer_email ?? "")}`} className="text-accent text-sm">
              {t("pay.trackOrder")}
            </Link>
          </div>
        )}

        {draft && !thanks && (
          <div className="space-y-8">
            {draft.status === "paid" && <p className="text-sm text-muted-foreground">{t("pay.alreadyPaid", { number: draft.order_number })}</p>}
            {draft.status === "expired" && <p className="text-sm text-destructive">{t("pay.expired")}</p>}
            {draft.status === "cancelled" && <p className="text-sm text-destructive">{t("pay.cancelled")}</p>}

            {canPay && pricing && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("pay.intro", { name: draft.customer_name || "" })}
                </p>

                <section className="border border-border">
                  <ul className="divide-y divide-border text-sm">
                    {pricing.lines.map((line) => (
                      <li key={line.slug} className="flex justify-between p-3">
                        <span>
                          {line.quantity} × {line.name}
                        </span>
                        <span className="text-muted-foreground">{formatPrice(Number(line.line_total))}</span>
                      </li>
                    ))}
                    {Number(pricing.discount_total) > 0 && (
                      <li className="flex justify-between p-3 text-emerald-700">
                        <span>{t("checkout.discountLine")}</span>
                        <span>−{formatPrice(Number(pricing.discount_total))}</span>
                      </li>
                    )}
                    <li className="flex justify-between p-3">
                      <span className="text-muted-foreground">{t("checkout.shipping")}</span>
                      <span>{Number(pricing.shipping_cost) === 0 ? t("checkout.free") : formatPrice(Number(pricing.shipping_cost))}</span>
                    </li>
                    <li className="flex justify-between p-3 text-base font-medium">
                      <span>{t("checkout.total")}</span>
                      <span>{formatPrice(Number(pricing.total))}</span>
                    </li>
                  </ul>
                </section>
                <p className="text-xs text-muted-foreground -mt-4">{t("pay.vat")}</p>
              </>
            )}

            {canPay && !pricing && draft.order_number && (
              <p className="text-sm text-muted-foreground">
                {t("pay.awaiting", { number: draft.order_number, amount: formatPrice(Number(draft.amount_due ?? 0)) })}
              </p>
            )}

            {canPay && (
              <>
                <section className="space-y-4">
                  <h2 className="text-sm font-medium text-foreground">{t("pay.addressTitle")}</h2>
                  <div className="space-y-1.5">
                    <Label htmlFor="pd-address">{t("checkout.address")}</Label>
                    <Input id="pd-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} disabled={draft.status === "awaiting_payment"} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="pd-postal">{t("checkout.postalCode")}</Label>
                      <Input id="pd-postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={20} disabled={draft.status === "awaiting_payment"} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pd-city">{t("checkout.city")}</Label>
                      <Input id="pd-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} disabled={draft.status === "awaiting_payment"} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pd-country">{t("checkout.country")}</Label>
                      <Input id="pd-country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} disabled={draft.status === "awaiting_payment"} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pd-phone">{t("checkout.phoneNumber")}</Label>
                    <Input id="pd-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox id="pd-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                    <Label htmlFor="pd-consent" className="text-xs font-light text-muted-foreground leading-relaxed cursor-pointer">
                      {t("checkout.marketingConsent")}
                    </Label>
                  </div>
                </section>

                {error && (
                  <p role="alert" className="text-xs text-destructive bg-destructive/10 p-3 rounded-sm">
                    {error}
                  </p>
                )}

                {PAYPAL_CLIENT_ID ? (
                  <PayPalScriptProvider options={{ clientId: PAYPAL_CLIENT_ID, currency: "EUR" }}>
                    <PayPalButtons
                      style={{ layout: "vertical", color: "black", shape: "rect", label: "pay" }}
                      createOrder={async (_data, actions) => {
                        const order = await startPayment();
                        return actions.order.create({
                          intent: "CAPTURE",
                          purchase_units: [
                            {
                              description: `Spavio AI Store ${order.order_number}`,
                              custom_id: order.order_number,
                              invoice_id: order.order_number,
                              amount: { currency_code: "EUR", value: Number(order.amount_charged).toFixed(2) },
                            },
                          ],
                        });
                      }}
                      onApprove={async (_data, actions) => {
                        if (!actions.order || !placed.current) return;
                        const details = await actions.order.capture();
                        try {
                          await recordOrderPayment(placed.current.order_number, placed.current.customer_email, String(details.id ?? ""));
                        } catch (err) {
                          // The payment went through; the shop can match it by the PayPal invoice id.
                          console.error("Could not store the PayPal reference:", err);
                        }
                        setThanks(placed.current.order_number);
                        void refetch();
                      }}
                      onError={() => setError((current) => current ?? t("pay.paypalError"))}
                      onCancel={() => setError(t("pay.cancelledPayment"))}
                    />
                  </PayPalScriptProvider>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("pay.paypalMissing")}</p>
                )}

                {draft.expires_at && draft.status === "open" && (
                  <p className="text-xs text-muted-foreground">{t("pay.validUntil", { date: date(draft.expires_at) })}</p>
                )}
              </>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default PayDraft;
