import { useTranslation } from "react-i18next";
import { Link } from "@/i18n/LocaleLink";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { useStorefrontProducts } from "@/hooks/useCatalog";
import { formatPrice } from "@/data/products";
import { orderStage, type CustomerOrder } from "@/lib/accountOrders";

interface OrderCardProps {
  order: CustomerOrder;
  /** Email the order was found with; passed on to the warranty form. */
  email: string;
}

const STAGE_STYLE: Record<string, string> = {
  delivered: "bg-emerald-500/10 text-emerald-700",
  shipped: "bg-violet-500/10 text-violet-700",
  preparing: "bg-blue-500/10 text-blue-700",
  payment_review: "bg-amber-500/10 text-amber-700",
  awaiting_payment: "bg-amber-500/10 text-amber-700",
  cancelled: "bg-destructive/10 text-destructive",
  refunded: "bg-destructive/10 text-destructive",
};

/** One order: status, items, delivery tracking, warranty end date and shortcuts. */
const OrderCard = ({ order, email }: OrderCardProps) => {
  const { t, i18n } = useTranslation("shop");
  const { addItem, openBag } = useCart();
  const { data: catalog = [] } = useStorefrontProducts();

  const stage = orderStage(order);
  const date = (value: string) => new Date(value).toLocaleDateString(i18n.language);
  const address = [
    order.shipping_address.address,
    [order.shipping_address.postal_code, order.shipping_address.city].filter(Boolean).join(" "),
    order.shipping_address.country,
  ]
    .filter(Boolean)
    .join(", ");

  const warrantyLink = (productName?: string) => {
    const params = new URLSearchParams({ order: order.order_number });
    if (email) params.set("email", email);
    if (productName) params.set("product", productName);
    return `/warranty?${params.toString()}`;
  };

  const buyAgain = (slug: string, quantity: number) => {
    const product = catalog.find((p) => p.slug === slug);
    if (!product) return;
    addItem(product, quantity);
    openBag();
  };

  return (
    <article className="border border-border p-5 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-light text-foreground">{order.order_number}</h2>
          <p className="text-xs text-muted-foreground">
            {t("orders.placedOn", { date: date(order.created_at) })} · {formatPrice(Number(order.total))}
          </p>
        </div>
        <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${STAGE_STYLE[stage]}`}>
          {t(`orders.stage.${stage}`)}
        </span>
      </header>

      <p className="text-xs text-muted-foreground">{t(`orders.stageHint.${stage}`)}</p>

      <ul className="divide-y divide-border border-y border-border">
        {order.items.map((item) => (
          <li key={item.slug} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span className="text-foreground">
              {item.quantity} × {item.name}
              <span className="block text-xs text-muted-foreground">
                {formatPrice(Number(item.unit_price) * item.quantity)}
              </span>
            </span>
            <span className="flex gap-4 text-xs">
              {catalog.some((p) => p.slug === item.slug) && (
                <button type="button" className="text-accent" onClick={() => buyAgain(item.slug, item.quantity)}>
                  {t("orders.buyAgain")}
                </button>
              )}
              {stage !== "cancelled" && stage !== "refunded" && (
                <Link to={warrantyLink(item.name)} className="text-accent">
                  {t("orders.reportProblem")}
                </Link>
              )}
            </span>
          </li>
        ))}
        <li className="flex justify-between py-2 text-xs text-muted-foreground">
          <span>{t("orders.shipping")}</span>
          <span>{formatPrice(Number(order.shipping_cost))}</span>
        </li>
        {Number(order.balance_due) > 0 && (
          <li className="flex justify-between py-2 text-xs text-muted-foreground">
            <span>{t("orders.balanceDue")}</span>
            <span>{formatPrice(Number(order.balance_due))}</span>
          </li>
        )}
      </ul>

      {order.deliveries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">{t("orders.deliveries")}</h3>
          {order.deliveries.map((delivery) => (
            <div key={delivery.delivery_number} className="text-xs text-muted-foreground">
              <span className="text-foreground">{t(`orders.deliveryStatus.${delivery.status}`)}</span>
              {delivery.carrier && ` · ${delivery.carrier}`}
              {delivery.tracking_number && (
                <>
                  {" · "}
                  {t("orders.tracking")}: <span className="font-mono text-foreground">{delivery.tracking_number}</span>
                </>
              )}
              {delivery.delivered_at && ` · ${t("orders.deliveredOn", { date: date(delivery.delivered_at) })}`}
            </div>
          ))}
        </div>
      )}

      {order.warranty_expires_at && (
        <p className="text-xs text-muted-foreground">
          {t("orders.warrantyUntil", { date: date(order.warranty_expires_at) })}
        </p>
      )}

      {address && (
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground">{t("orders.shipTo")}:</span> {address}
        </p>
      )}

      {order.returns.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">{t("orders.returns")}</h3>
          {order.returns.map((entry) => (
            <div key={entry.return_number} className="text-xs text-muted-foreground">
              <Link
                to={`/returns/track?return=${entry.return_number}${email ? `&email=${encodeURIComponent(email)}` : ""}`}
                className="text-accent"
              >
                {entry.return_number}
              </Link>
              {" · "}
              {t(`returns.status.${entry.status}`)}
            </div>
          ))}
        </div>
      )}

      {order.can_return && order.return_window_ends_at && (
        <p className="text-xs text-muted-foreground">
          {t("orders.returnUntil", { date: date(order.return_window_ends_at) })}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {order.can_return && (
          <Button asChild size="sm">
            <Link to={`/returns?order=${order.order_number}${email ? `&email=${encodeURIComponent(email)}` : ""}`}>
              {t("orders.returnItems")}
            </Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link to={warrantyLink()}>{t("orders.needHelp")}</Link>
        </Button>
      </div>
    </article>
  );
};

export default OrderCard;
