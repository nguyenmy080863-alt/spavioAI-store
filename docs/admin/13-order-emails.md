# Order emails

Customers who order at checkout (with or without an account) get up to three emails. Requires migration `0014_order_emails_account_orders.sql`.

> **Status: queueing works, sending is pending.** The store decides when an email is due and queues it, but nothing is delivered until an email provider is connected (see *Pending setup* below). Queued emails are not lost: they wait and go out once the sender is connected.

## When each email is sent
| Email | Sent when | Content |
| --- | --- | --- |
| **Order received** | The customer finished paying at checkout and PayPal reported the payment | Order number, items, shipping, total, delivery address, preorder balance if any |
| **Payment confirmed** | You press **Mark as paid** on the order | Same details; the order is now being prepared |
| **Order shipped** | A delivery goes to **On delivery** (picked up by the carrier) | Items, carrier and tracking number. One email per delivery |

Rules:
- Only orders placed at **checkout** send emails. Orders you create by hand in the admin do not.
- Each email is queued **once** per order (the shipped email once per delivery). Pressing buttons again never sends duplicates.
- Card and Klarna payments are still simulated, so they do not report a payment and send no "received" email.
- Emails are written in the language the customer used at checkout (German, English or Vietnamese) and link to the order page and the warranty page. They contain no marketing, so the marketing consent checkbox does not apply.
- Guests receive them as well. The link in the email opens the order page for that order and email, no account needed.

## Return and exchange emails
Sent for every return, in the language of the original order, with a link to the return page (`/returns/track`):

| Email | Sent when |
| --- | --- |
| **Return request received** | The customer submits a return |
| **Return approved** | You approve it (includes your message and label details if a label exists) |
| **Return label ready** | A prepaid label was created |
| **Return rejected** | You reject it (includes your reason) |
| **Parcel received** | You mark the parcel received |
| **Refund issued / exchange complete** | The return is refunded, or an exchange is completed (shows items value, label deduction and net refund or settlement) |

Cancelled returns send no email. Each email is queued once per return. Replacement orders created by an exchange send the normal **shipped** email.

## See what was sent
Open a checkout order: the **Customer emails** box lists each email with its status:
- **Queued, not sent yet:** waiting for the sender (or about to be sent).
- **Sent:** delivered to the provider, with the time.
- **Failed:** the sender tried 5 times and gave up. The last error is shown. After fixing the cause, press **Retry**.

## Pending setup (not done yet)
The code is ready; these steps need your accounts and cannot be done from the code alone.
1. **Create an email provider account.** The sender is written for Resend (free tier about 3,000 emails per month). Add your domain `spavioai.store` and add the SPF and DKIM DNS records it shows, so emails do not land in spam.
2. **Deploy the sender** (Supabase CLI):
   `supabase functions deploy send-order-emails --no-verify-jwt`
3. **Set the secrets:**
   `supabase secrets set RESEND_API_KEY=... EMAIL_FROM="Spavio AI Store <orders@spavioai.store>" WEBHOOK_SECRET=<a long random string> SITE_URL=https://spavioai.store`
4. **Trigger it.** In Supabase, add a **Database Webhook** on table `email_outbox`, event *Insert*, type *Supabase Edge Function* (or HTTP) calling `send-order-emails`, with the header `x-webhook-secret: <the same random string>`. As a safety net you can also call the function on a schedule (for example every 15 minutes) to pick up retries.
5. **Test** with a checkout order: pay, check the order shows "Order received", mark it paid, create and ship a delivery, and confirm three emails arrive.

Code: `supabase/functions/send-order-emails/` (`index.ts` sends, `templates.ts` holds the German, English and Vietnamese texts and the layout; edit the texts there). The queue and the trigger rules are in the migration.

## Not included yet
- Emails for cancellation or refund.
- A shipped email when a delivery is marked *Delivered*.
- Unsubscribe links (not needed for order emails).
