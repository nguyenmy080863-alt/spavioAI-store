import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "@/i18n/LocaleLink";
import Header from "@/components/header/Header";
import Footer from "@/components/footer/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { formatPrice } from "@/data/products";
import {
  addReturnTracking,
  cancelReturn,
  downloadReturnLabel,
  fetchPublicReturn,
  refundNet,
  type PublicReturn,
} from "@/lib/returns";

const STEPS = ["requested", "approved", "received", "refunded"] as const;

const ReturnView = ({ ret, email }: { ret: PublicReturn; email: string }) => {
  const { t, i18n } = useTranslation("shop");
  const queryClient = useQueryClient();
  const [tracking, setTracking] = useState(ret.tracking_number);
  const date = (value: string | null) => (value ? new Date(value).toLocaleDateString(i18n.language) : "");

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["public-return", ret.return_number] });

  const saveTracking = useMutation({
    mutationFn: () => addReturnTracking(ret.return_number, email, tracking),
    onSuccess: () => {
      toast.success(t("returns.track.trackingSaved"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: () => cancelReturn(ret.return_number, email),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const label = useMutation({
    mutationFn: () => downloadReturnLabel(ret.return_number, email),
    onError: (e: Error) => toast.error(t("returns.track.labelError"), { description: e.message }),
  });

  const exchange = ret.resolution === "exchange";
  // An exchange is "completed" instead of "refunded".
  const statusKey = (status: string) =>
    exchange && status === "refunded" ? "returns.statusExchange.refunded" : `returns.status.${status}`;
  const deduction = Number(ret.refund_deduction);
  const settlement = Number(ret.settlement_amount);

  const stepIndex = STEPS.indexOf(ret.status as (typeof STEPS)[number]);
  const stopped = ret.status === "rejected" || ret.status === "cancelled";

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h2 className="text-xl font-light text-foreground">{ret.return_number}</h2>
          <span className="rounded-full bg-accent/10 text-accent px-3 py-0.5 text-xs font-medium">
            {t(statusKey(ret.status))}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("returns.track.forOrder", { order: ret.order_number })} · {t("returns.track.requestedOn", { date: date(ret.created_at) })}
        </p>
      </div>

      {!stopped && (
        <ol className="grid grid-cols-4 gap-2 text-center text-xs">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className={`border-t-2 pt-2 ${index <= stepIndex ? "border-accent text-foreground" : "border-border text-muted-foreground"}`}
            >
              {t(statusKey(step))}
            </li>
          ))}
        </ol>
      )}

      <p className="text-sm text-muted-foreground">
        {t(exchange && (ret.status === "received" || ret.status === "refunded") ? `returns.statusHintExchange.${ret.status}` : `returns.statusHint.${ret.status}`)}
      </p>

      {ret.customer_message && (
        <div className="border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground mb-1">{t("returns.track.messageFromUs")}</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{ret.customer_message}</p>
        </div>
      )}

      {ret.has_label && !stopped && ret.status !== "refunded" && (
        <div className="border border-border p-4 space-y-2">
          <p className="text-sm text-foreground">{t("returns.track.labelTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {[ret.label_carrier, ret.label_tracking_number].filter(Boolean).join(" · ")}
          </p>
          <Button size="sm" disabled={label.isPending} onClick={() => label.mutate()}>
            {label.isPending ? t("returns.form.looking") : t("returns.track.labelDownload")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("returns.track.labelHint")}</p>
        </div>
      )}

      <ul className="divide-y divide-border border border-border text-sm">
        {ret.items.map((item) => (
          <li key={item.name} className="p-3 space-y-1">
            <div className="flex justify-between">
              <span>
                {item.quantity} × {item.name}
              </span>
              <span className="text-muted-foreground">{formatPrice(Number(item.unit_price) * item.quantity)}</span>
            </div>
            {exchange && item.exchange_name && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {t("returns.track.replacedBy")}: {item.quantity} × {item.exchange_name}
                </span>
                <span>{formatPrice(Number(item.exchange_unit_price ?? 0) * item.quantity)}</span>
              </div>
            )}
          </li>
        ))}
        {deduction > 0 && (
          <li className="flex justify-between p-3 text-muted-foreground">
            <span>{t("returns.track.labelDeduction")}</span>
            <span>− {formatPrice(deduction)}</span>
          </li>
        )}
        {!exchange && (
          <li className="flex justify-between p-3">
            <span className="text-foreground">
              {ret.status === "refunded"
                ? t("returns.track.refunded", { date: date(ret.refunded_at) })
                : t("returns.track.expectedRefund")}
            </span>
            <span className="text-foreground">
              {formatPrice(ret.status === "refunded" && ret.refunded_amount !== null ? Number(ret.refunded_amount) : refundNet(ret))}
            </span>
          </li>
        )}
      </ul>

      {exchange && (
        <div className="text-sm text-muted-foreground space-y-1">
          {ret.replacement_order_number ? (
            <p>{t("returns.track.replacementOrder", { number: ret.replacement_order_number })}</p>
          ) : (
            <p>{t("returns.track.exchangeNote")}</p>
          )}
          {ret.replacement_order_number && settlement > 0 && (
            <p>{t("returns.track.settlementPay", { amount: formatPrice(settlement) })}</p>
          )}
          {ret.replacement_order_number && settlement < 0 && (
            <p>{t("returns.track.settlementRefund", { amount: formatPrice(-settlement) })}</p>
          )}
        </div>
      )}

      {(ret.status === "requested" || ret.status === "approved") && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveTracking.mutate();
          }}
        >
          <Label htmlFor="r-tracking">{t("returns.track.trackingLabel")}</Label>
          <div className="flex gap-2">
            <Input id="r-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={80} />
            <Button type="submit" size="sm" variant="outline" disabled={saveTracking.isPending}>
              {t("returns.track.saveTracking")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("returns.track.trackingHint")}</p>
        </form>
      )}

      {ret.status === "requested" && (
        <Button
          size="sm"
          variant="outline"
          disabled={cancel.isPending}
          onClick={() => {
            if (window.confirm(t("returns.track.cancelConfirm"))) cancel.mutate();
          }}
        >
          {t("returns.track.cancel")}
        </Button>
      )}
    </div>
  );
};

/** Return lookup by return number + email; signed-in owners can skip the email. */
const ReturnTrack = () => {
  const { t } = useTranslation("shop");
  const { user, loading } = useAdminAuth();
  const [params, setParams] = useSearchParams();

  const returnParam = (params.get("return") ?? "").trim().toUpperCase();
  const emailParam = (params.get("email") ?? "").trim();
  const [returnInput, setReturnInput] = useState(returnParam);
  const [emailInput, setEmailInput] = useState(emailParam);

  const email = emailParam || (user?.email ?? "");
  const enabled = !!returnParam && !loading;

  const { data: ret, isFetching } = useQuery({
    queryKey: ["public-return", returnParam, email],
    queryFn: () => fetchPublicReturn(returnParam, email),
    enabled,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO page="returnTrack" canonical="/returns/track" noindex />
      <Header />
      <main className="flex-1 px-6 py-16 max-w-2xl mx-auto w-full">
        <h1 className="text-3xl font-serif text-foreground mb-3">{t("returns.track.title")}</h1>
        <p className="text-sm text-muted-foreground mb-10">{t("returns.track.intro")}</p>

        {ret ? (
          <div className="space-y-8">
            <ReturnView ret={ret} email={email} />
            <Button variant="outline" size="sm" onClick={() => setParams({})}>
              {t("returns.track.another")}
            </Button>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              const next: Record<string, string> = { return: returnInput.trim() };
              if (emailInput.trim()) next.email = emailInput.trim();
              setParams(next);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="rt-number">{t("returns.track.returnNumber")}</Label>
              <Input
                id="rt-number"
                value={returnInput}
                onChange={(e) => setReturnInput(e.target.value)}
                placeholder="RT-00001"
                required
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rt-email">{t("returns.form.email")}</Label>
              <Input
                id="rt-email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={user?.email}
                required={!user}
                maxLength={255}
              />
            </div>
            {enabled && !isFetching && ret === null && (
              <p className="text-sm text-destructive">{t("returns.track.notFound")}</p>
            )}
            <Button type="submit" disabled={isFetching}>
              {isFetching ? t("returns.form.looking") : t("returns.track.lookup")}
            </Button>
          </form>
        )}

        <p className="text-sm mt-10">
          <Link to="/returns" className="text-accent">
            {t("returns.track.startNew")}
          </Link>
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default ReturnTrack;
