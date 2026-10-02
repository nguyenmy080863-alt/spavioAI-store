import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "@/i18n/LocaleLink";
import Header from "@/components/header/Header";
import Footer from "@/components/footer/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useStorefrontProducts } from "@/hooks/useCatalog";
import { useProductText } from "@/i18n/useProductText";
import { formatPrice } from "@/data/products";
import {
  RETURN_REASONS,
  RETURN_WINDOW_DAYS,
  createReturn,
  fetchReturnPolicy,
  fetchReturnableItems,
  type ReturnReason,
  type ReturnResolution,
  type ReturnableOrder,
} from "@/lib/returns";

/** Start a return within the trial window: order lookup, item selection, reason, condition check. */
const ReturnRequest = () => {
  const { t, i18n } = useTranslation("shop");
  const { user } = useAdminAuth();
  const [params] = useSearchParams();

  const [orderNumber, setOrderNumber] = useState(params.get("order") ?? "");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [order, setOrder] = useState<ReturnableOrder | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [resolution, setResolution] = useState<ReturnResolution>("refund");
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (user?.email) setEmail((current) => current || user.email!);
  }, [user?.email]);

  const date = (value: string) => new Date(value).toLocaleDateString(i18n.language);

  const { data: policy } = useQuery({ queryKey: ["return-policy"], queryFn: fetchReturnPolicy, retry: false });
  const { data: catalog = [] } = useStorefrontProducts();
  const { localize } = useProductText();
  // Replacements must be in stock and not a preorder.
  const replacementOptions = catalog.filter((p) => !p.preorder && (p.stock ?? 0) > 0).map(localize);
  const priceOf = (slug: string | undefined) => {
    const product = catalog.find((p) => p.slug === slug);
    return product ? (product.salePrice ?? product.price) : 0;
  };

  const lookup = useMutation({
    mutationFn: () => fetchReturnableItems(orderNumber.trim(), email.trim()),
    onSuccess: (result) => {
      setOrder(result);
      setNotFound(result === null);
      setQuantities({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: () => {
      if (!reason) throw new Error(t("returns.form.chooseReason"));
      const items = Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([sales_order_item_id, quantity]) => ({
          sales_order_item_id,
          quantity,
          exchange_slug: resolution === "exchange" ? replacements[sales_order_item_id] : undefined,
        }));
      if (items.length === 0) throw new Error(t("returns.form.chooseItems"));
      if (resolution === "exchange" && items.some((item) => !item.exchange_slug)) {
        throw new Error(t("returns.form.chooseReplacement"));
      }
      if (!confirmed) throw new Error(t("returns.form.confirmRequired"));
      return createReturn({
        orderNumber: orderNumber.trim(),
        email: email.trim(),
        reason,
        note,
        items,
        conditionConfirmed: confirmed,
        resolution,
      });
    },
    onError: (e: Error) => toast.error(t("returns.form.errorTitle"), { description: e.message }),
  });

  const result = submit.data;
  const returnable = order?.items.filter((item) => item.quantity_returnable > 0 && item.in_window) ?? [];
  const refundPreview = (order?.items ?? []).reduce(
    (sum, item) => sum + (quantities[item.sales_order_item_id] ?? 0) * Number(item.unit_price),
    0,
  );
  const replacementValue = (order?.items ?? []).reduce(
    (sum, item) => sum + (quantities[item.sales_order_item_id] ?? 0) * priceOf(replacements[item.sales_order_item_id]),
    0,
  );
  const difference = replacementValue - refundPreview;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO page="returnRequest" canonical="/returns" noindex />
      <Header />
      <main className="flex-1 px-6 py-16 max-w-2xl mx-auto w-full">
        <h1 className="text-3xl font-serif text-foreground mb-3">{t("returns.title")}</h1>
        <p className="text-sm text-muted-foreground mb-4">{t("returns.intro", { days: RETURN_WINDOW_DAYS })}</p>
        <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground mb-4">
          {(["condition", "hygiene", "refund", "withdrawal"] as const).map((key) => (
            <li key={key}>{t(`returns.policy.${key}`, { days: RETURN_WINDOW_DAYS })}</li>
          ))}
          <li>{t(policy?.deduct_label_cost ? "returns.policy.labelDeducted" : "returns.policy.labelFree")}</li>
        </ul>
        <p className="text-sm mb-10">
          <Link to="/returns/track" className="text-accent">
            {t("returns.trackLink")}
          </Link>
        </p>

        {result ? (
          <div className="border border-border p-6 space-y-4">
            <h2 className="text-lg font-light text-foreground">{t("returns.success.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {resolution === "exchange"
                ? t("returns.success.textExchange", { number: result.return_number })
                : t("returns.success.text", { number: result.return_number, amount: formatPrice(Number(result.refund_amount)) })}
            </p>
            <p className="text-sm text-muted-foreground">{t("returns.success.next")}</p>
            <Button asChild size="sm">
              <Link to={`/returns/track?return=${result.return_number}&email=${encodeURIComponent(email)}`}>
                {t("returns.success.track")}
              </Link>
            </Button>
          </div>
        ) : !order ? (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              lookup.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="r-order">{t("returns.form.orderNumber")}</Label>
              <Input
                id="r-order"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="SO-00042"
                required
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-email">{t("returns.form.email")}</Label>
              <Input
                id="r-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
              />
              <p className="text-xs text-muted-foreground">{t("returns.form.lookupHint")}</p>
            </div>
            {notFound && <p className="text-sm text-destructive">{t("returns.form.notFound")}</p>}
            <Button type="submit" disabled={lookup.isPending}>
              {lookup.isPending ? t("returns.form.looking") : t("returns.form.lookup")}
            </Button>
          </form>
        ) : order.blocked ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive">{t(`returns.blocked.${order.blocked}`)}</p>
            <Button variant="outline" size="sm" onClick={() => setOrder(null)}>
              {t("returns.form.back")}
            </Button>
          </div>
        ) : (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <div>
              <h2 className="text-sm font-medium text-foreground mb-3">
                {t("returns.form.itemsTitle", { number: order.order_number })}
              </h2>
              <ul className="divide-y divide-border border border-border">
                {order.items.map((item) => {
                  const available = item.quantity_returnable > 0 && item.in_window;
                  return (
                    <li key={item.sales_order_item_id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                      <span>
                        <span className="text-foreground">{item.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatPrice(Number(item.unit_price))}
                          {" · "}
                          {!item.delivered_at
                            ? t("returns.form.notDelivered")
                            : item.quantity_returnable === 0
                              ? t("returns.form.alreadyReturned")
                              : item.in_window
                                ? t("returns.form.until", { date: date(item.window_ends_at!) })
                                : t("returns.form.windowEnded", { date: date(item.window_ends_at!) })}
                        </span>
                      </span>
                      {available && (
                        <Select
                          value={String(quantities[item.sales_order_item_id] ?? 0)}
                          onValueChange={(value) =>
                            setQuantities((prev) => ({ ...prev, [item.sales_order_item_id]: Number(value) }))
                          }
                        >
                          <SelectTrigger className="w-24" aria-label={t("returns.form.quantity")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: item.quantity_returnable + 1 }, (_, n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {available && resolution === "exchange" && (quantities[item.sales_order_item_id] ?? 0) > 0 && (
                        <div className="basis-full space-y-1">
                          <Label className="text-xs text-muted-foreground">{t("returns.form.replacement")}</Label>
                          <Select
                            value={replacements[item.sales_order_item_id] ?? ""}
                            onValueChange={(value) => setReplacements((prev) => ({ ...prev, [item.sales_order_item_id]: value }))}
                          >
                            <SelectTrigger aria-label={t("returns.form.replacement")}>
                              <SelectValue placeholder={t("returns.form.replacementPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {replacementOptions.map((product) => (
                                <SelectItem key={product.slug} value={product.slug}>
                                  {product.name} · {formatPrice(product.salePrice ?? product.price)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {returnable.length === 0 && (
                <p className="text-sm text-destructive mt-3">{t("returns.form.nothingToReturn")}</p>
              )}
            </div>

            {returnable.length > 0 && (
              <>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-foreground mb-2">{t("returns.form.resolution")}</legend>
                  <RadioGroup value={resolution} onValueChange={(value) => setResolution(value as ReturnResolution)}>
                    {(["refund", "exchange"] as const).map((value) => (
                      <div key={value} className="flex items-center gap-3">
                        <RadioGroupItem value={value} id={`res-${value}`} />
                        <Label htmlFor={`res-${value}`} className="font-light">
                          {t(`returns.form.resolutions.${value}`)}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </fieldset>

                <div className="space-y-1.5">
                  <Label htmlFor="r-reason">{t("returns.form.reason")}</Label>
                  <Select value={reason} onValueChange={(value) => setReason(value as ReturnReason)}>
                    <SelectTrigger id="r-reason">
                      <SelectValue placeholder={t("returns.form.reasonPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {RETURN_REASONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`returns.reason.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {reason === "defective" && (
                    <p className="text-xs text-muted-foreground">
                      {t("returns.form.defectiveHint")}{" "}
                      <Link
                        to={`/warranty?order=${order.order_number}&email=${encodeURIComponent(email)}`}
                        className="text-accent"
                      >
                        {t("returns.form.defectiveLink")}
                      </Link>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="r-note">{t("returns.form.note")}</Label>
                  <Textarea id="r-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000} />
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="r-confirm"
                    checked={confirmed}
                    onCheckedChange={(checked) => setConfirmed(checked === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="r-confirm" className="text-xs font-light text-muted-foreground leading-relaxed cursor-pointer">
                    {t("returns.form.confirm")}
                  </Label>
                </div>

                {resolution === "refund" ? (
                  <p className="text-sm text-foreground">
                    {t("returns.form.refundPreview", { amount: formatPrice(refundPreview) })}
                  </p>
                ) : (
                  <p className="text-sm text-foreground">
                    {replacementValue === 0
                      ? t("returns.form.exchangePending")
                      : difference > 0
                        ? t("returns.form.exchangePay", { amount: formatPrice(difference) })
                        : difference < 0
                          ? t("returns.form.exchangeRefund", { amount: formatPrice(-difference) })
                          : t("returns.form.exchangeEven")}
                  </p>
                )}

                <div className="flex gap-3">
                  <Button type="submit" disabled={submit.isPending}>
                    {submit.isPending ? t("returns.form.submitting") : t("returns.form.submit")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setOrder(null)}>
                    {t("returns.form.back")}
                  </Button>
                </div>
              </>
            )}
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default ReturnRequest;
