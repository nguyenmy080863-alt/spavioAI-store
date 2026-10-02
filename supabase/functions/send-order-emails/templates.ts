// Order email templates (DE / EN / VI). Pure functions, no network: easy to test and edit.

export type EmailKind = "order_received" | "payment_confirmed" | "order_shipped";
export type Lang = "de" | "en" | "vi";

export interface EmailOrder {
  order_number: string;
  customer_name: string;
  total: number;
  shipping_cost: number;
  amount_charged: number;
  balance_due: number;
  shipping_address: { address?: string; city?: string; postal_code?: string; country?: string };
  items: { name: string; quantity: number; unit_price: number }[];
}

export interface EmailDelivery {
  carrier: string | null;
  tracking_number: string | null;
}

interface Copy {
  subject: Record<EmailKind, string>;
  heading: Record<EmailKind, string>;
  intro: Record<EmailKind, string>;
  hello: string;
  items: string;
  shipping: string;
  total: string;
  charged: string;
  balance: string;
  address: string;
  tracking: string;
  carrier: string;
  viewOrder: string;
  warranty: string;
  footer: string;
}

const COPY: Record<Lang, Copy> = {
  de: {
    subject: {
      order_received: "Wir haben deine Bestellung {n} erhalten",
      payment_confirmed: "Zahlung für Bestellung {n} bestätigt",
      order_shipped: "Deine Bestellung {n} ist unterwegs",
    },
    heading: {
      order_received: "Danke für deine Bestellung",
      payment_confirmed: "Deine Zahlung ist bestätigt",
      order_shipped: "Deine Bestellung ist unterwegs",
    },
    intro: {
      order_received:
        "Wir haben deine Bestellung und deine Zahlungsmeldung erhalten. Sobald wir die Zahlung geprüft haben, bekommst du eine Bestätigung.",
      payment_confirmed: "Wir haben deine Zahlung geprüft. Wir bereiten deine Bestellung jetzt für den Versand vor.",
      order_shipped: "Dein Paket wurde an den Versanddienstleister übergeben.",
    },
    hello: "Hallo {name},",
    items: "Artikel",
    shipping: "Versand",
    total: "Gesamt",
    charged: "Heute bezahlt",
    balance: "Restbetrag bei Versand (Vorbestellung)",
    address: "Lieferadresse",
    tracking: "Sendungsnummer",
    carrier: "Versanddienstleister",
    viewOrder: "Bestellung ansehen",
    warranty: "Auf deine Geräte gibt es 2 Jahre Garantie ab Lieferung. Hilfe bekommst du unter {url}.",
    footer: "Du erhältst diese E-Mail, weil du bei Spavio AI Store bestellt hast.",
  },
  en: {
    subject: {
      order_received: "We received your order {n}",
      payment_confirmed: "Payment confirmed for order {n}",
      order_shipped: "Your order {n} is on its way",
    },
    heading: {
      order_received: "Thank you for your order",
      payment_confirmed: "Your payment is confirmed",
      order_shipped: "Your order is on its way",
    },
    intro: {
      order_received:
        "We received your order and your payment notice. Once we have checked the payment you will get a confirmation.",
      payment_confirmed: "We have checked your payment. We are now preparing your order for shipping.",
      order_shipped: "Your parcel has been handed to the carrier.",
    },
    hello: "Hello {name},",
    items: "Items",
    shipping: "Shipping",
    total: "Total",
    charged: "Paid today",
    balance: "Balance due at shipping (preorder)",
    address: "Delivery address",
    tracking: "Tracking number",
    carrier: "Carrier",
    viewOrder: "View your order",
    warranty: "Your devices come with a 2-year warranty from delivery. Need help? Visit {url}.",
    footer: "You receive this email because you ordered from Spavio AI Store.",
  },
  vi: {
    subject: {
      order_received: "Chúng tôi đã nhận đơn hàng {n} của bạn",
      payment_confirmed: "Đã xác nhận thanh toán cho đơn hàng {n}",
      order_shipped: "Đơn hàng {n} của bạn đang được giao",
    },
    heading: {
      order_received: "Cảm ơn bạn đã đặt hàng",
      payment_confirmed: "Thanh toán của bạn đã được xác nhận",
      order_shipped: "Đơn hàng của bạn đang trên đường giao",
    },
    intro: {
      order_received:
        "Chúng tôi đã nhận đơn hàng và thông báo thanh toán của bạn. Sau khi kiểm tra thanh toán, bạn sẽ nhận được email xác nhận.",
      payment_confirmed: "Chúng tôi đã kiểm tra thanh toán của bạn và đang chuẩn bị đơn hàng để giao.",
      order_shipped: "Gói hàng của bạn đã được bàn giao cho đơn vị vận chuyển.",
    },
    hello: "Xin chào {name},",
    items: "Sản phẩm",
    shipping: "Phí vận chuyển",
    total: "Tổng cộng",
    charged: "Đã thanh toán hôm nay",
    balance: "Số dư thanh toán khi giao hàng (đặt trước)",
    address: "Địa chỉ giao hàng",
    tracking: "Mã vận đơn",
    carrier: "Đơn vị vận chuyển",
    viewOrder: "Xem đơn hàng",
    warranty: "Thiết bị của bạn được bảo hành 2 năm kể từ ngày giao. Cần hỗ trợ? Truy cập {url}.",
    footer: "Bạn nhận email này vì đã đặt hàng tại Spavio AI Store.",
  },
};

const LOCALE: Record<Lang, string> = { de: "de-DE", en: "en-GB", vi: "vi-VN" };

export const normaliseLang = (value: string | null | undefined): Lang =>
  value === "en" || value === "vi" ? value : "de";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** German is served without a prefix; English and Vietnamese get /en and /vi. */
export const pageUrl = (siteUrl: string, lang: Lang, path: string) =>
  `${siteUrl.replace(/\/$/, "")}${lang === "de" ? "" : `/${lang}`}${path}`;

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

export interface RenderInput {
  kind: EmailKind;
  lang: Lang;
  order: EmailOrder;
  delivery?: EmailDelivery | null;
  siteUrl: string;
  to: string;
}

export const renderEmail = ({ kind, lang, order, delivery, siteUrl, to }: RenderInput) => {
  const c = COPY[lang];
  const money = (value: number) =>
    new Intl.NumberFormat(LOCALE[lang], { style: "currency", currency: "EUR" }).format(Number(value));
  const orderUrl = `${pageUrl(siteUrl, lang, "/orders/track")}?order=${encodeURIComponent(order.order_number)}&email=${encodeURIComponent(to)}`;
  const warrantyUrl = pageUrl(siteUrl, lang, "/warranty");
  const name = order.customer_name || "";
  const a = order.shipping_address ?? {};
  const address = [a.address, [a.postal_code, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ");

  const subject = fill(c.subject[kind], { n: order.order_number });

  const lines = order.items.map((i) => ({ text: `${i.quantity} × ${i.name}`, price: money(i.quantity * i.unit_price) }));
  const totals: [string, string][] = [
    [c.shipping, money(order.shipping_cost)],
    [c.total, money(order.total)],
  ];
  if (Number(order.balance_due) > 0) {
    totals.push([c.charged, money(order.amount_charged)], [c.balance, money(order.balance_due)]);
  }

  const trackingBlock =
    kind === "order_shipped" && delivery
      ? [
          delivery.carrier ? [c.carrier, delivery.carrier] : null,
          delivery.tracking_number ? [c.tracking, delivery.tracking_number] : null,
        ].filter((row): row is string[] => row !== null)
      : [];

  const html = `<!doctype html>
<html lang="${lang}"><body style="margin:0;background:#f6f4fb;font-family:Arial,Helvetica,sans-serif;color:#1f1b2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:32px">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#761dea">Spavio AI Store</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:normal">${escapeHtml(c.heading[kind])}</h1>
<p style="margin:0 0 12px">${escapeHtml(fill(c.hello, { name }))}</p>
<p style="margin:0 0 20px">${escapeHtml(c.intro[kind])}</p>
<p style="margin:0 0 8px;font-size:13px;color:#6b6780">${escapeHtml(order.order_number)}</p>
<table role="presentation" width="100%" cellpadding="6" cellspacing="0" style="border-top:1px solid #e6e2f0;border-bottom:1px solid #e6e2f0;margin-bottom:16px">
${lines.map((l) => `<tr><td>${escapeHtml(l.text)}</td><td align="right">${escapeHtml(l.price)}</td></tr>`).join("\n")}
${totals.map(([label, value]) => `<tr><td style="color:#6b6780">${escapeHtml(label)}</td><td align="right">${escapeHtml(value)}</td></tr>`).join("\n")}
</table>
${trackingBlock.map(([label, value]) => `<p style="margin:0 0 6px"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("\n")}
<p style="margin:16px 0 4px"><strong>${escapeHtml(c.address)}</strong></p>
<p style="margin:0 0 20px">${escapeHtml(name)}<br>${escapeHtml(address)}</p>
<p style="margin:0 0 24px"><a href="${orderUrl}" style="background:#761dea;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:24px;display:inline-block">${escapeHtml(c.viewOrder)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#6b6780">${escapeHtml(fill(c.warranty, { url: warrantyUrl }))}</p>
<p style="margin:0;font-size:11px;color:#9a96ad">${escapeHtml(c.footer)}</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    c.heading[kind],
    "",
    fill(c.hello, { name }),
    c.intro[kind],
    "",
    order.order_number,
    ...lines.map((l) => `${l.text}  ${l.price}`),
    ...totals.map(([label, value]) => `${label}: ${value}`),
    ...trackingBlock.map(([label, value]) => `${label}: ${value}`),
    "",
    `${c.address}: ${name}, ${address}`,
    `${c.viewOrder}: ${orderUrl}`,
    "",
    fill(c.warranty, { url: warrantyUrl }),
    c.footer,
  ].join("\n");

  return { subject, html, text };
};
