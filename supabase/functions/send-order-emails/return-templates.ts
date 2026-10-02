// Return and exchange email templates (DE / EN / VI). Pure functions, no network.

import { pageUrl, type Lang } from "./templates.ts";

export type ReturnEmailKind =
  | "return_requested"
  | "return_approved"
  | "return_rejected"
  | "return_label_ready"
  | "return_received"
  | "return_refunded";

export const RETURN_KINDS: ReturnEmailKind[] = [
  "return_requested",
  "return_approved",
  "return_rejected",
  "return_label_ready",
  "return_received",
  "return_refunded",
];

export interface EmailReturn {
  return_number: string;
  order_number: string;
  customer_name: string;
  resolution: "refund" | "exchange";
  refund_amount: number;
  refund_deduction: number;
  refunded_amount: number | null;
  settlement_amount: number;
  customer_message: string;
  has_label: boolean;
  label_carrier: string;
  label_tracking_number: string;
  items: { name: string; quantity: number; unit_price: number; exchange_name: string | null; exchange_unit_price: number | null }[];
}

interface Copy {
  subject: Record<ReturnEmailKind, string>;
  heading: Record<ReturnEmailKind, string>;
  intro: Record<ReturnEmailKind, string>;
  introExchange: Partial<Record<ReturnEmailKind, string>>;
  hello: string;
  returned: string;
  replacement: string;
  itemsValue: string;
  deduction: string;
  refundTotal: string;
  settlementPay: string;
  settlementRefund: string;
  messageFromUs: string;
  labelInfo: string;
  carrier: string;
  tracking: string;
  viewReturn: string;
  footer: string;
}

const COPY: Record<Lang, Copy> = {
  de: {
    subject: {
      return_requested: "Wir haben deine Rücksendeanfrage {n} erhalten",
      return_approved: "Deine Rücksendung {n} wurde freigegeben",
      return_rejected: "Zu deiner Rücksendung {n}",
      return_label_ready: "Dein Rücksendeetikett für {n} ist bereit",
      return_received: "Wir haben deine Rücksendung {n} erhalten",
      return_refunded: "Deine Rücksendung {n} ist abgeschlossen",
    },
    heading: {
      return_requested: "Rücksendeanfrage erhalten",
      return_approved: "Deine Rücksendung ist freigegeben",
      return_rejected: "Deine Rücksendung konnte nicht angenommen werden",
      return_label_ready: "Dein Rücksendeetikett ist bereit",
      return_received: "Wir haben dein Paket erhalten",
      return_refunded: "Deine Rücksendung ist abgeschlossen",
    },
    intro: {
      return_requested: "Danke. Wir prüfen deine Anfrage und melden uns mit der Freigabe.",
      return_approved: "Du kannst die Artikel jetzt zurücksenden. Die Anleitung findest du unten und auf deiner Rücksendeseite.",
      return_rejected: "Leider können wir diese Rücksendung nicht annehmen. Den Grund findest du unten.",
      return_label_ready: "Du kannst dein kostenloses Rücksendeetikett auf deiner Rücksendeseite herunterladen und ausdrucken.",
      return_received: "Dein Paket ist bei uns angekommen. Wir prüfen es jetzt.",
      return_refunded: "Wir haben deine Erstattung veranlasst. Sie erscheint innerhalb weniger Tage bei deiner Zahlungsart.",
    },
    introExchange: {
      return_received: "Dein Paket ist bei uns angekommen. Wir prüfen es und bereiten deinen Umtausch vor.",
      return_refunded: "Dein Umtausch ist abgeschlossen. Dein Ersatzgerät wird versandfertig gemacht; du erhältst eine eigene Versandmitteilung.",
    },
    hello: "Hallo {name},",
    returned: "Rückgabe",
    replacement: "Ersatz",
    itemsValue: "Wert der zurückgegebenen Artikel",
    deduction: "Abzug Rücksendeetikett",
    refundTotal: "Erstattung",
    settlementPay: "Das Ersatzgerät kostet {amount} mehr. Wir melden uns, um die Zahlung zu klären, bevor wir es versenden.",
    settlementRefund: "Wir erstatten dir die Differenz von {amount}.",
    messageFromUs: "Nachricht von Spavio",
    labelInfo: "Rücksendeetikett",
    carrier: "Versanddienstleister",
    tracking: "Sendungsnummer",
    viewReturn: "Rücksendung ansehen",
    footer: "Du erhältst diese E-Mail, weil du eine Rücksendung bei Spavio AI Store angefragt hast.",
  },
  en: {
    subject: {
      return_requested: "We received your return request {n}",
      return_approved: "Your return {n} is approved",
      return_rejected: "About your return {n}",
      return_label_ready: "Your return label for {n} is ready",
      return_received: "We received your return {n}",
      return_refunded: "Your return {n} is complete",
    },
    heading: {
      return_requested: "Return request received",
      return_approved: "Your return is approved",
      return_rejected: "We could not accept your return",
      return_label_ready: "Your return label is ready",
      return_received: "We received your parcel",
      return_refunded: "Your return is complete",
    },
    intro: {
      return_requested: "Thank you. We are reviewing your request and will get back to you with an approval.",
      return_approved: "You can send the items back now. The instructions are below and on your return page.",
      return_rejected: "Unfortunately we cannot accept this return. You can find the reason below.",
      return_label_ready: "You can download and print your free return label from your return page.",
      return_received: "Your parcel has arrived. We are checking it now.",
      return_refunded: "We have issued your refund. It appears on your payment method within a few days.",
    },
    introExchange: {
      return_received: "Your parcel has arrived. We are checking it and preparing your exchange.",
      return_refunded: "Your exchange is complete. Your replacement is being prepared; you will get a separate shipping email.",
    },
    hello: "Hello {name},",
    returned: "Returned",
    replacement: "Replacement",
    itemsValue: "Value of returned items",
    deduction: "Return label deduction",
    refundTotal: "Refund",
    settlementPay: "The replacement costs {amount} more. We will contact you to arrange the payment before we ship it.",
    settlementRefund: "We refund the difference of {amount}.",
    messageFromUs: "Message from Spavio",
    labelInfo: "Return label",
    carrier: "Carrier",
    tracking: "Tracking number",
    viewReturn: "View your return",
    footer: "You receive this email because you requested a return at Spavio AI Store.",
  },
  vi: {
    subject: {
      return_requested: "Chúng tôi đã nhận yêu cầu trả hàng {n} của bạn",
      return_approved: "Yêu cầu trả hàng {n} đã được duyệt",
      return_rejected: "Về yêu cầu trả hàng {n} của bạn",
      return_label_ready: "Nhãn trả hàng cho {n} đã sẵn sàng",
      return_received: "Chúng tôi đã nhận hàng trả {n}",
      return_refunded: "Yêu cầu trả hàng {n} đã hoàn tất",
    },
    heading: {
      return_requested: "Đã nhận yêu cầu trả hàng",
      return_approved: "Yêu cầu trả hàng đã được duyệt",
      return_rejected: "Chúng tôi không thể chấp nhận yêu cầu trả hàng",
      return_label_ready: "Nhãn trả hàng đã sẵn sàng",
      return_received: "Chúng tôi đã nhận kiện hàng của bạn",
      return_refunded: "Yêu cầu trả hàng đã hoàn tất",
    },
    intro: {
      return_requested: "Cảm ơn bạn. Chúng tôi đang xem xét yêu cầu và sẽ phản hồi khi được duyệt.",
      return_approved: "Bạn có thể gửi hàng lại ngay. Hướng dẫn có bên dưới và trên trang trả hàng của bạn.",
      return_rejected: "Rất tiếc chúng tôi không thể chấp nhận yêu cầu này. Lý do có bên dưới.",
      return_label_ready: "Bạn có thể tải và in nhãn trả hàng miễn phí từ trang trả hàng của mình.",
      return_received: "Kiện hàng của bạn đã đến. Chúng tôi đang kiểm tra.",
      return_refunded: "Chúng tôi đã thực hiện hoàn tiền. Tiền sẽ về phương thức thanh toán của bạn trong vài ngày.",
    },
    introExchange: {
      return_received: "Kiện hàng của bạn đã đến. Chúng tôi đang kiểm tra và chuẩn bị đổi hàng.",
      return_refunded: "Việc đổi hàng đã hoàn tất. Thiết bị thay thế đang được chuẩn bị; bạn sẽ nhận email giao hàng riêng.",
    },
    hello: "Xin chào {name},",
    returned: "Trả lại",
    replacement: "Thay thế",
    itemsValue: "Giá trị sản phẩm trả lại",
    deduction: "Khấu trừ nhãn trả hàng",
    refundTotal: "Hoàn tiền",
    settlementPay: "Thiết bị thay thế đắt hơn {amount}. Chúng tôi sẽ liên hệ để thống nhất thanh toán trước khi giao.",
    settlementRefund: "Chúng tôi hoàn lại phần chênh lệch {amount}.",
    messageFromUs: "Tin nhắn từ Spavio",
    labelInfo: "Nhãn trả hàng",
    carrier: "Đơn vị vận chuyển",
    tracking: "Mã vận đơn",
    viewReturn: "Xem yêu cầu trả hàng",
    footer: "Bạn nhận email này vì đã yêu cầu trả hàng tại Spavio AI Store.",
  },
};

const LOCALE: Record<Lang, string> = { de: "de-DE", en: "en-GB", vi: "vi-VN" };

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

export interface RenderReturnInput {
  kind: ReturnEmailKind;
  lang: Lang;
  ret: EmailReturn;
  siteUrl: string;
  to: string;
}

export const renderReturnEmail = ({ kind, lang, ret, siteUrl, to }: RenderReturnInput) => {
  const c = COPY[lang];
  const money = (value: number) =>
    new Intl.NumberFormat(LOCALE[lang], { style: "currency", currency: "EUR" }).format(Number(value));
  const exchange = ret.resolution === "exchange";
  const url = `${pageUrl(siteUrl, lang, "/returns/track")}?return=${encodeURIComponent(ret.return_number)}&email=${encodeURIComponent(to)}`;
  const name = ret.customer_name || "";

  const subject = fill(c.subject[kind], { n: ret.return_number });
  const intro = (exchange && c.introExchange[kind]) || c.intro[kind];

  const lines: [string, string][] = [];
  for (const item of ret.items) {
    lines.push([`${c.returned}: ${item.quantity} × ${item.name}`, money(item.quantity * item.unit_price)]);
    if (exchange && item.exchange_name) {
      lines.push([`${c.replacement}: ${item.quantity} × ${item.exchange_name}`, money(item.quantity * Number(item.exchange_unit_price ?? 0))]);
    }
  }

  const totals: [string, string][] = [];
  const showMoney = kind === "return_refunded" || kind === "return_approved" || kind === "return_requested";
  if (showMoney) {
    totals.push([c.itemsValue, money(ret.refund_amount)]);
    if (Number(ret.refund_deduction) > 0) totals.push([c.deduction, `− ${money(ret.refund_deduction)}`]);
    if (!exchange) totals.push([c.refundTotal, money(Number(ret.refund_amount) - Number(ret.refund_deduction))]);
  }
  let settlement = "";
  if (exchange && kind === "return_refunded") {
    const diff = Number(ret.settlement_amount);
    settlement = diff > 0 ? fill(c.settlementPay, { amount: money(diff) }) : diff < 0 ? fill(c.settlementRefund, { amount: money(-diff) }) : "";
  }

  const labelBlock =
    (kind === "return_label_ready" || kind === "return_approved") && ret.has_label
      ? [
          [c.labelInfo, ret.label_carrier || "—"],
          [c.tracking, ret.label_tracking_number || "—"],
        ]
      : [];

  const message = ret.customer_message && (kind === "return_approved" || kind === "return_rejected") ? ret.customer_message : "";

  const html = `<!doctype html>
<html lang="${lang}"><body style="margin:0;background:#f6f4fb;font-family:Arial,Helvetica,sans-serif;color:#1f1b2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:32px">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#761dea">Spavio AI Store</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:normal">${escapeHtml(c.heading[kind])}</h1>
<p style="margin:0 0 12px">${escapeHtml(fill(c.hello, { name }))}</p>
<p style="margin:0 0 20px">${escapeHtml(intro)}</p>
${message ? `<div style="margin:0 0 20px;padding:12px 16px;background:#f6f4fb;border-left:3px solid #761dea"><p style="margin:0 0 4px;font-size:12px;color:#6b6780">${escapeHtml(c.messageFromUs)}</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(message)}</p></div>` : ""}
<p style="margin:0 0 8px;font-size:13px;color:#6b6780">${escapeHtml(ret.return_number)} · ${escapeHtml(ret.order_number)}</p>
<table role="presentation" width="100%" cellpadding="6" cellspacing="0" style="border-top:1px solid #e6e2f0;border-bottom:1px solid #e6e2f0;margin-bottom:16px">
${lines.map(([a, b]) => `<tr><td>${escapeHtml(a)}</td><td align="right">${escapeHtml(b)}</td></tr>`).join("\n")}
${totals.map(([a, b]) => `<tr><td style="color:#6b6780">${escapeHtml(a)}</td><td align="right">${escapeHtml(b)}</td></tr>`).join("\n")}
</table>
${settlement ? `<p style="margin:0 0 16px">${escapeHtml(settlement)}</p>` : ""}
${labelBlock.map(([a, b]) => `<p style="margin:0 0 6px"><strong>${escapeHtml(a)}:</strong> ${escapeHtml(b)}</p>`).join("\n")}
<p style="margin:16px 0 24px"><a href="${url}" style="background:#761dea;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:24px;display:inline-block">${escapeHtml(c.viewReturn)}</a></p>
<p style="margin:0;font-size:11px;color:#9a96ad">${escapeHtml(c.footer)}</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    c.heading[kind],
    "",
    fill(c.hello, { name }),
    intro,
    ...(message ? ["", `${c.messageFromUs}:`, message] : []),
    "",
    `${ret.return_number} · ${ret.order_number}`,
    ...lines.map(([a, b]) => `${a}  ${b}`),
    ...totals.map(([a, b]) => `${a}: ${b}`),
    ...(settlement ? [settlement] : []),
    ...labelBlock.map(([a, b]) => `${a}: ${b}`),
    "",
    `${c.viewReturn}: ${url}`,
    "",
    c.footer,
  ].join("\n");

  return { subject, html, text };
};
