# Roadmap

## 0. Spavio AI Store rebrand (beauty devices) — done
- [x] Violet Glam theme (#761DEA / #5346A7), Manrope + Playfair, lotus wordmark
- [x] 14-device catalog, SVG product art, collections, device guide
- [x] Supabase optional: bundled catalog + demo flash sale without .env
- [x] Seed migration 0008 for categories, products and hero copy

## 0b. Preorders — done
- [x] Admin: per-product preorder switch, deposit (fixed EUR or %), expected shipping date
- [x] Storefront: badges, deposit/balance on the product page, due-today vs due-at-shipping in bag and checkout
- [ ] Charge the balance when a preorder ships (order records exist now; the balance is stored on the order)

## 1. Rebrand: LITALASH (lash products) — done (superseded)
- [x] Logo SVG wordmark, index.html title/meta/og
- [x] Lash catalog data, generated imagery
- [x] Home, category, product detail, nav, footer, legal + about copy

## 2. Working cart flow — done
- [x] CartContext with localStorage persistence
- [x] ProductDetail add-to-bag, ShoppingBag off-canvas, header badge
- [x] Checkout summary, totals, empty state, clear on order complete

## 3. Admin panel (v1: auth + products + media) — done
- [x] Backend schema: profiles, user_roles (RBAC), products, product_images, categories, audit_logs + RLS/grants
- [x] Admin login (email/password, attempt lockout, first-user Super Admin bootstrap)
- [x] Product CRUD: searchable/filterable paginated table, publish toggle, archive/restore, bulk delete
- [x] Media: drag-and-drop multi-upload, compression + thumbnails, private storage bucket
- [x] Team & roles page, audit log page, low-stock alerts
- [x] Storefront reads products from the database

## 4. Multilingual storefront (EN/DE/VI) — done
- [x] react-i18next setup, language detection + persistence, header language switcher
- [x] Translated nav, footer, homepage, shop/product/checkout, about and legal pages

## 5. Evergreen FOMO campaign — done
- [x] Admin config: timer duration + reset rule (loop / delay), fake stock, initial & max sold %, live-purchase simulation
- [x] Product/discount mapping (percentage or explicit display price)
- [x] Session countdown widget (localStorage T_end, seamless reload, auto reset) + dynamic progress bar
- [x] Checkout prices unchanged — widget is client-side UI only

## 5b. Warranty & support tickets — v1 done
- [x] Customer and guest ticket form (guidance / defect), ticket lookup by number + email, tickets in the account page
- [x] Admin queue and ticket page: status flow, internal notes, visit scheduling, resolution, audit log
- [x] Warranty check from the matched order's delivery date (2 years)
- [ ] v1.1: email notifications (ticket received, replies, visit scheduled; new-ticket alert for admins)
- [ ] Photo/video attachments, link a ticket to a specific order line

## 5c. Checkout orders & Customers v1 — done
- [x] Checkout stores orders for guests and signed-in customers; prices recalculated on the server
- [x] Customer records from orders, sign-ups and warranty tickets (one per email, guests get no account)
- [x] Marketing consent checkbox at checkout and sign-up; admin customer list, tags, notes, CSV export
- [x] Segments: high spenders, no purchase in 180 days
- [x] Privacy: download customer data, anonymise customer
- [ ] More segments (device owned, warranty ending, abandoned cart) — on request

## 5d. Order emails & customer order pages — done except sending
- [x] Email queue with rules: order received, payment confirmed, order shipped (checkout orders, guests included)
- [x] Templates in DE/EN/VI and the sender function (`supabase/functions/send-order-emails`)
- [ ] Connect an email provider and deploy the sender (pending, see docs/admin/13-order-emails.md)
- [x] `/account/orders` for signed-in customers and `/orders/track` for guests: status, tracking, warranty date, buy again, report a problem
- [ ] Emails for cancellation and refund

## 5e. Returns — done
- [x] Customers and guests start a return within the 30-day trial (items, quantities, reason, condition check); track it by return number + email
- [x] Admin: review, approve / reject, receive, record refund, restock; refunds reduce customer total spent
- [x] Return emails (queued), prepaid Sendcloud return labels with optional cost deduction, PayPal refund function, exchanges with price settlement
- [ ] Connect PayPal refunds, Sendcloud labels and the email provider (pending, see docs/admin/14-returns.md)
- [ ] Collect exchange price differences automatically; move outgoing Sendcloud calls to the server

## 5f. Discounts (phase 1) — done
- [x] Discount codes and automatic discounts: percent / fixed off the order, categories or products; free shipping; minimum spend and quantity; dates; usage limits; once per customer; new customers only; exclude sale items
- [x] Server-side pricing shared by the checkout preview and the order; share links `/discount/CODE`; refund-safe item prices; per-discount reporting
- [x] Phase 2: Buy X Get Y, eligibility by customer segment, combinations matrix (product / order / shipping classes), personal codes
- [ ] 30-day lowest-price tracking for "was / now" prices; review the flash sale fake stock (see legal notes in docs/admin/15-discounts.md)

## 5g. Finance (simple) — done
- [x] Overview for a period: gross / net sales, discounts, returns, refunds, label costs, average order value
- [x] Money to check: unconfirmed payments, refunds waiting, exchange differences, preorder balances; open purchase orders
- [x] Rough margin estimate from purchase order costs; CSV transaction export for the accountant
- [ ] VAT and invoices (needs tax advisor input), PayPal fees and payout reconciliation, printable monthly summary

## 5h. Analytics — done (without visitor tracking)
- [x] KPI dashboard: sales summary with change vs previous period, sales over time, products, categories, new vs returning customers, discounts, returns, geography, payment methods, warranty
- [x] Reports: choose KPIs and a period, preview, export CSV or print / save as PDF
- [x] Live view: today vs yesterday, orders per hour, needs-attention counters, latest orders (30 s refresh)
- [ ] Visitor tracking (sessions, conversion, traffic sources, cart events) — needs a consent decision

## 5i. Draft orders — done
- [x] Drafts: customer, locked item prices, custom price / discount (with reason, Super Admin and Order Processor only), codes and automatic discounts via the checkout engine, shipping, tags and notes
- [x] Create order unpaid or already paid; payment link `/pay/<token>` with PayPal (sent by hand until emails are connected)
- [x] Replaces the old New order form
- [ ] Stock reservation for drafts, preorders in drafts, emailing the payment link, invoices (needs tax advisor input)

## 6. Next up

- [ ] Verify PayPal captures on the server (edge function) and mark orders paid automatically
- [ ] Nested categories UI + product variants (size/colour with per-variant SKU/price)
- [ ] Optional TOTP 2FA for privileged accounts
