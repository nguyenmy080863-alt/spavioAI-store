# Test plan

A checklist to confirm that every feature works as designed. Run it on the **test project**, not on the live store (see [Test environment and dummy data](02-test-environment.md)). Tick each line when the expected result happens; write the problem next to it when it does not.

**How to read it.** *Steps* are what you do, *Expected* is what you must see. Amounts include VAT. "Seed" means the dummy data from `drizzle/seed/test-data.sql`. Use `@test.invalid` emails for every order, ticket and sign-up. Tests marked **(after connecting)** need PayPal, Sendcloud or the email provider, which are not connected yet.

## 0. Before you start
| ID | Check | Expected | Done |
| --- | --- | --- | --- |
| 0.1 | Migrations 0000 to 0024 applied on the test project, in order | No error in the SQL editor; admin pages load without "migration has not been applied" messages | ☐ |
| 0.2 | App runs with `npm run dev -- --mode test` | Network requests go to the test project URL, not the live one | ☐ |
| 0.3 | Seed script ran | Products page lists the 7 TEST- products; Customers lists the test customers | ☐ |
| 0.4 | Four accounts exist (admin, processor, inventory, customer) with the right roles | Each can sign in; admin sees every sidebar section | ☐ |
| 0.5 | Running the seed a second time | No errors, no duplicates | ☐ |

## 1. Roles and permissions
| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 1.1 | Open `/admin` while signed out | Redirected to the login page | ☐ |
| 1.2 | Sign in as `customer@test.invalid` (no role) and open `/admin` | Access refused (no admin pages) | ☐ |
| 1.3 | As **Inventory Manager** open Finance, Gift cards, Warranty, Customers | Finance and Gift cards refuse access ("Only Super Admins and Order Processors"); can open Products, Inventory, Purchase orders | ☐ |
| 1.4 | As Inventory Manager open a draft order and set a custom price or custom discount | Fields are not shown, or saving is refused | ☐ |
| 1.5 | As **Order Processor** open Products → edit a product | "You do not have permission to edit products" | ☐ |
| 1.6 | As Order Processor open Gift cards, Finance, Drafts, Returns | All open and work | ☐ |
| 1.7 | As Order Processor change the "Deduct label cost" setting on Returns | Setting is disabled ("Only a Super Admin can change this") | ☐ |
| 1.8 | As Order Processor open Analytics, Reports, Live view | Open and show numbers | ☐ |
| 1.9 | As Super Admin anonymise a customer; as Order Processor try the same | Only Super Admin sees the button | ☐ |

## 2. Storefront: browsing and products
| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 2.1 | Open the shop in German, English and Vietnamese | Texts change, prices stay in EUR, URLs get `/en` and `/vi` | ☐ |
| 2.2 | Open each TEST product page | Name, price, stock behaviour as designed; `TEST-DRAFT` shows "not found" | ☐ |
| 2.3 | Product `TEST-DEVICE-B` | Shows €160 with €200 crossed out | ☐ |
| 2.4 | Product `TEST-PRE` | Preorder badge, deposit €60, balance €240, expected shipping date | ☐ |
| 2.5 | Product page | **No customer reviews block and no star rating** | ☐ |
| 2.6 | Open `/category/test-collection` | Lists Glow Device and Gel in the order set in the admin; title in the current language | ☐ |
| 2.7 | Open `/category/new-in`, `/category/sale`, `/category/best-sellers` | Each lists the right products; "best sellers" uses the database collection | ☐ |
| 2.8 | Search for "gel" | Finds the Test Conductive Gel | ☐ |
| 2.9 | Add products to the bag, reload, sign in | Bag survives a reload and merges with the saved bag after login | ☐ |
| 2.10 | Admin: as Super Admin open `/product/test-draft-product?preview=1` | Page shows with the "Preview: not published" banner. Signed out, the same URL shows "not found" | ☐ |

## 3. Checkout basics
Use a fresh email such as `anna@test.invalid` unless a test says otherwise. Default shipping is the first method (DHL, €3.90 base). Free shipping applies automatically from €99.

| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 3.1 | Bag: 1× Gel (€20) | Subtotal €20, shipping €3.90, total **€23.90** | ☐ |
| 3.2 | Bag: 1× Glow Device (€150) | Shipping **Free**, total **€150.00** | ☐ |
| 3.3 | Submit checkout with an empty email or address | Message "Please fill in your email, name and shipping address first"; no order created | ☐ |
| 3.4 | Bag: 3× `TEST-LOW` (only 2 in stock), try to pay | Order refused: not enough stock | ☐ |
| 3.5 | Bag: `TEST-OUT` | Cannot be ordered | ☐ |
| 3.6 | Bag: 1× `TEST-PRE` | Due today **€60.00** (deposit), balance due at shipping €240.00, shipping free | ☐ |
| 3.7 | Pay with the **PayPal sandbox** buyer | Confirmation shows an order number (SO-…). Order appears in admin Orders as **unpaid** with a PayPal reference and the amount | ☐ (after connecting a PayPal sandbox) |
| 3.8 | Admin: open that order | Shows address, phone, shipping, "charged at checkout", payment reference and a reminder to check PayPal before marking paid | ☐ |
| 3.9 | Choose **card** or **Klarna** (simulated) | Confirmation appears, order is created **unpaid**, no money taken | ☐ |
| 3.10 | Change a product price in the admin while the page is open, then pay | Checkout stops with "prices have changed"; no wrong charge | ☐ |
| 3.11 | Check "send me news" at checkout | Customer record shows marketing consent with source "checkout" | ☐ |
| 3.12 | Order as a guest, then as a signed-in `customer@test.invalid` | Both work; the guest gets no account; the customer's order appears under `/account/orders` | ☐ |
| 3.13 | Customer pays twice quickly (double click on PayPal) | At most one order per click is created; the 5-open-orders-per-hour limit stops spam | ☐ |
| 3.14 | Remove the Supabase variables (demo mode) and place an order | Checkout still shows a confirmation, no order is saved, no errors | ☐ |

## 4. Discounts
Expected totals use the seed codes. "New customer" = an email without an earlier paid order (for example `anna@test.invalid`).

| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 4.1 | 1× Glow + 1× Gel with `TESTWELCOME10` as a new customer | Discount −€17.00, shipping free, total **€153.00** | ☐ |
| 4.2 | Same code with email `repeat@test.invalid` (has paid orders) | Code refused when the order is placed: "for first orders only" | ☐ |
| 4.3 | Same code used a second time by the same new email | Refused: "already used" | ☐ |
| 4.4 | 1× Wand (sale price) with `TESTWELCOME10` | Message that the code does not apply to the items (sale items are skipped); total €160.00 | ☐ |
| 4.5 | 1× Wand with `TESTSALE10` | Discount −€16.00, free shipping, total **€144.00** | ☐ |
| 4.6 | 1× Glow with `TESTFIXED15` | Total **€135.00** | ☐ |
| 4.7 | 1× Gel with `TESTFIXED15` | Message about the minimum spend €100; no discount | ☐ |
| 4.8 | 1× Glow with `TESTGLOW20` | −€30.00, total **€120.00** | ☐ |
| 4.9 | 1× Gel with `TESTGLOW20` | Message: does not apply to the items in the bag | ☐ |
| 4.10 | 1× Gel with `TESTSHIP` | Shipping becomes free, total **€20.00** | ☐ |
| 4.11 | 3× Gel (automatic Buy 2 Get 1) | One gel free, items €40.00, shipping €3.90, total **€43.90**, no code needed | ☐ |
| 4.12 | 3× Gel plus `TESTWELCOME10` | Buy X Get Y wins (saves €20 vs €6); message that the code cannot be combined | ☐ |
| 4.13 | 1× Glow plus `TESTVIP15` as `anna@test.invalid` | Accepted in the preview; refused when the order is placed (not eligible, no vip tag) | ☐ |
| 4.14 | Same with email `vip@test.invalid` | −€22.50, total €127.50 | ☐ |
| 4.15 | `TESTPERSONAL25` with `anna@test.invalid` | Refused when ordering ("issued for another customer"); with `vip@test.invalid` it gives −€25 once, a second use is refused | ☐ |
| 4.16 | `TESTLIMIT2` on three different orders | First two work, the third says the code is used up | ☐ |
| 4.17 | `TESTEXPIRED` | "This code has expired" | ☐ |
| 4.18 | Wrong code `NOPE` | "This code is not valid" | ☐ |
| 4.19 | Codes in lower case and with spaces | Work (codes are not case sensitive) | ☐ |
| 4.20 | Preorder item with `TESTSALE10` | No discount on the preorder item | ☐ |
| 4.21 | Share link `/discount/TESTFIXED15` | Redirects to the shop with a "code saved" message; checkout has the code applied | ☐ |
| 4.22 | Apply a code, then remove it | Totals go back to the undiscounted values | ☐ |
| 4.23 | Place an order with a code; open the order in admin | Order shows the code and the amount saved; item prices are after the discount | ☐ |
| 4.24 | Admin Discounts list | Uses, "given away" and revenue per discount match the orders you placed | ☐ |
| 4.25 | Create a new code with the form (percent, products, dates, limit) | Saved; works at checkout; deleting a used discount is refused ("switch it off instead") | ☐ |
| 4.26 | Create a product-class and an order-class discount, tick both "can combine" boxes | Both apply on one order; unticked, only the better one applies | ☐ |
| 4.27 | Two orders race for the last use of a limited code | Only one succeeds | ☐ |

## 5. Gift cards
Seed cards: `GC-TEST-TEST-TEST-0001` €50, `…-0002` €10, `…-0003` expired, `…-0004` switched off.

| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 5.1 | Admin: issue a gift card €200 with a note "TEST …" | Code shown with Copy code / Copy message; appears in the list with balance €200 | ☐ |
| 5.2 | Issue a card of €201, €0 and with a past expiry date | Each refused with a clear message | ☐ |
| 5.3 | Checkout with 3× Gel (€43.90): apply card 0001 | "Pay with gift card" replaces the payment methods; summary shows −€43.90 | ☐ |
| 5.4 | Press "Pay with gift card" | Confirmation with an order number. In admin the order is **paid** (payment method gift card), stock reserved, card balance **€6.10** | ☐ |
| 5.5 | Checkout total €153 (Glow + Gel + `TESTWELCOME10`): apply card 0002 (€10) | Summary shows −€10; PayPal amount is **€143.00**; card balance becomes €0 after the order | ☐ |
| 5.6 | Apply the expired card 0003 | "This gift card has expired" | ☐ |
| 5.7 | Apply the switched-off card 0004 | "This gift card is not active" | ☐ |
| 5.8 | Apply a used-up card, and a wrong code | "No balance left" / "not valid" | ☐ |
| 5.9 | Codes with different spelling (`gc-test-test-test-0001`, without dashes) | Accepted | ☐ |
| 5.10 | Apply a card, place the order with PayPal but do not pay; wait 3 hours (or cancel the order in admin) | Balance returns to the card; history shows "Given back" | ☐ |
| 5.11 | Cancel a paid order that used a card | Card balance restored | ☐ |
| 5.12 | Card history in admin | Every movement listed with order or return number and the balance after | ☐ |
| 5.13 | Correct a balance (+10 and −5) with a reason; try −500 and +500 | Works with a reason; refused if below 0 or above €200; no reason → refused | ☐ |
| 5.14 | Switch a card off and on | Checkout refuses it while off | ☐ |
| 5.15 | Customer (no role) and Inventory Manager open Gift cards | No access | ☐ |
| 5.16 | A signed-out visitor checks a code at checkout | Gets only valid / not valid, never the list of cards | ☐ |
| 5.17 | Finance page after the tests | Outstanding balance equals the sum of balances of active cards; issued, used and credited-back amounts match the history | ☐ |

## 6. Orders and deliveries (admin)
| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 6.1 | Open an unpaid checkout order, press **Mark as paid** | Status paid; product stock (shop availability) goes down by the quantity | ☐ |
| 6.2 | Orders list filters (open, paid, unpaid, cancelled) and search | Each filter and search by number, name, email works | ☐ |
| 6.3 | Create a delivery for part of the order | Order shows shipped 1 / 2; delivery is "Preparing" | ☐ |
| 6.4 | Press **Picked up by carrier** | Delivery "On delivery"; on hand and reserved stock both go down; a "shipped" email is queued | ☐ |
| 6.5 | Press **Mark delivered** on every delivery | Order becomes **Completed** | ☐ |
| 6.6 | Cancel an unpaid order | Cancelled; nothing to release | ☐ |
| 6.7 | Cancel a paid order that is not shipped | Reserved stock is released | ☐ |
| 6.8 | Try to change items of a paid order | Refused (items locked once paid) | ☐ |
| 6.9 | Customer: `/orders/track` with order number and email | Shows status, items, tracking number | ☐ |
| 6.10 | Wrong email or order number on the tracking page | "Not found", no data leaked | ☐ |
| 6.11 | Customer account `/account/orders` | Lists own orders with status, tracking, warranty date, buy again | ☐ |

## 7. Draft orders and payment links
| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 7.1 | Create draft, search customer `repeat@test.invalid`, add 1× Glow and 1× Gel | Customer fields filled; summary shows €170.00, free shipping | ☐ |
| 7.2 | Draft does not appear in Orders, Finance, Analytics, stock | Confirmed | ☐ |
| 7.3 | Add a product, then change its catalogue price in the admin | Draft keeps the old price until you press "Refresh prices" | ☐ |
| 7.4 | As Order Processor set a custom price €100 on the Glow (reason "price match") | Summary shows the reduction; price above the catalogue price is refused | ☐ |
| 7.5 | Custom price without a reason | Refused | ☐ |
| 7.6 | Custom discount 10 % with reason | Applied; codes and automatic discounts are replaced | ☐ |
| 7.7 | Enter code `TESTFIXED15` | Same result as in checkout; an invalid code shows a message and blocks creating the order | ☐ |
| 7.8 | **Create order** unpaid | Order created (source "created from a draft"), draft locked and linked; stock not yet reserved | ☐ |
| 7.9 | **Create order** with "already paid" and method bank transfer | Order is paid; stock reserved; draft completed | ☐ |
| 7.10 | Draft with more than the available stock | Warning in the summary; order cannot be created | ☐ |
| 7.11 | **Create link** (valid 1 day), copy it | URL like `/pay/…`; customer email and name required | ☐ |
| 7.12 | Open the link signed out | Shows items and total, address form, PayPal button | ☐ |
| 7.13 | Leave the address empty and pay | Message "fill in street, postal code and city" | ☐ |
| 7.14 | Pay with the sandbox buyer | Order created like a checkout order; unpaid until you mark it paid; draft shows "customer started payment" | ☐ (after connecting a PayPal sandbox) |
| 7.15 | Open the link again after the order exists | Same order is reused, never a second one | ☐ |
| 7.16 | Create a new link | Old link stops working ("not valid") | ☐ |
| 7.17 | Link past its expiry (set 1 hour, wait or edit the date) | "This payment link has expired" | ☐ |
| 7.18 | Mark the link order paid | Draft status becomes completed | ☐ |
| 7.19 | Duplicate a draft; delete a draft | Duplicate uses current catalogue prices; a draft with an order cannot be deleted | ☐ |
| 7.20 | Preorder product in a draft | Cannot be added | ☐ |

## 8. Shipping labels
Without Sendcloud connected:

| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 8.1 | Create a delivery; press **Create shipping label** | Form opens with address split into street and house number and an estimated weight | ☐ |
| 8.2 | Service list | Says "Sendcloud is not connected yet" and the buy button is disabled; manual carrier and tracking still possible | ☐ |
| 8.3 | Weight estimate | Product weights × quantity + packaging (250 g), or the default (2000 g) when no weight is known | ☐ |
| 8.4 | Address with a non-EU country | Marked "Not an EU country"; excluded from bulk | ☐ |
| 8.5 | Address without house number | "No house number found" warning; fix in the single form | ☐ |
| 8.6 | Orders → Shipping labels | Lists deliveries in "Preparing" with a Check column; select several for different countries → "Select deliveries for the same country" | ☐ |
| 8.7 | Product form: set a weight; weights settings (Super Admin only) | Saved; used in the estimate | ☐ |
| 8.8 | Checkout no longer creates a parcel or shows a tracking number on the confirmation | Confirmed | ☐ |

After connecting Sendcloud **(after connecting)**:

| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 8.9 | Buy a label for one delivery | Tracking number, service and cost stored; A6 and A4 PDFs download | ☐ |
| 8.10 | Cancel the label before pickup | Label cancelled; tracking cleared; delivery can be cancelled | ☐ |
| 8.11 | Buy labels in bulk (3 deliveries, same country) | Progress shown; a failing row is listed without stopping the rest | ☐ |
| 8.12 | Delivery with an active label: press "Cancel" on the delivery | Disabled until the label is cancelled | ☐ |

## 9. Returns, exchanges and refunds
Prepare: a **delivered** paid order (mark paid → delivery → picked up → delivered). Use `TEST-DEVICE-A` (€150) and `TEST-GEL`.

| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 9.1 | `/returns` with order number and email of that order | Lists the items with the last day to return (delivery + 30 days) | ☐ |
| 9.2 | Wrong email; unpaid order; cancelled order; order not yet delivered | Each refused with a clear message | ☐ |
| 9.3 | Back-date the delivery to 31 days ago in the database and try again | "Return period ended" for those items | ☐ |
| 9.4 | Request a refund return without ticking the condition box | Refused | ☐ |
| 9.5 | Request a refund return for 1× Glow, reason "changed my mind" | Return number RT-…, expected refund €150.00 (shipping not refunded) | ☐ |
| 9.6 | Request the same item again | Not offered again (already in a return) | ☐ |
| 9.7 | Customer: `/returns/track` | Status "Requested", can cancel; cancelling frees the item | ☐ |
| 9.8 | Admin: reject without a message | Refused; with a message the customer sees it | ☐ |
| 9.9 | Admin: approve with instructions; customer adds a tracking number | Customer sees the message and status "Approved" | ☐ |
| 9.10 | Mark parcel received | Status "Received"; "put items back in stock" appears; works once | ☐ |
| 9.11 | Set a deduction of €5 (label cost), refund by hand: **Mark as refunded** | Net refund €145.00; customer sees the deduction and refund; customer total spent drops by €145 | ☐ |
| 9.12 | Defective reason with the "deduct label cost" setting on | Deduction not applied automatically; button hidden | ☐ |
| 9.13 | **Refund via PayPal** | Says PayPal is not connected | ☐ (works after connecting) |
| 9.14 | Exchange: return 1× Glow for 1× Wand (sale €160) | Preview "replacement costs €10.00 more"; after receipt **Create replacement order** creates an unpaid order for €160 with amount €10.00 due | ☐ |
| 9.15 | Exchange: return 1× Glow for 1× Gel (€20) | After receipt, replacement order is paid and ready; settlement −€130.00 refund due | ☐ |
| 9.16 | Exchange replacement out of stock | Cannot be requested or completed ("not enough stock") | ☐ |
| 9.17 | Order paid with a gift card, then return | Return page shows the gift card box; credit part to the card; PayPal refund covers only the rest; refund blocked until you decide | ☐ |
| 9.18 | Order page for the customer | Shows "Return items" within 30 days, and the returns with their status | ☐ |
| 9.19 | Rate limit | Sixth request in a day by one email refused | ☐ |
| 9.20 | Label creation | "Sendcloud is not connected" message | ☐ (works after connecting) |

## 10. Warranty tickets
| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 10.1 | `/warranty` as a guest: defect ticket with a valid order number and email | Ticket WT-…; confirmation says the order was matched | ☐ |
| 10.2 | Same with a wrong order number | Ticket created, shows "purchase unverified" for the admin | ☐ |
| 10.3 | Admin: reply, internal note, change status, schedule a visit | Customer sees replies and the visit date but not internal notes | ☐ |
| 10.4 | Customer: `/warranty/track` with ticket number and email; add a reply | Reply appears; replying to a resolved ticket reopens it | ☐ |
| 10.5 | Warranty state badge | In warranty until delivery + 2 years; "not delivered yet" before delivery | ☐ |
| 10.6 | Visit status without a visit date | Refused | ☐ |
| 10.7 | Closed ticket | Customer cannot reply | ☐ |
| 10.8 | Order page link "Report a problem" | Opens the warranty form with order, email and product filled | ☐ |

## 11. Customers
| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 11.1 | Place an order as a new email | One customer record created automatically (source order); a second order updates the same record | ☐ |
| 11.2 | Sign up an account with an email that already ordered as a guest | Same customer record; marked "Account" | ☐ |
| 11.3 | Open a warranty ticket as a new email | Customer record created (source warranty) | ☐ |
| 11.4 | Customers list: search, segments "High spenders" (threshold) and "No purchase in 180 days" | `vip` appears in high spenders at 500; `lapsed` appears in the 180-day segment; others do not | ☐ |
| 11.5 | Export CSV with "only customers who agreed to marketing" ticked, then unticked | First file has only consenting customers; no formula injection (cells starting with `=` are quoted) | ☐ |
| 11.6 | Customer page: edit tags, notes; tick consent | Saved; consent date and source "admin" shown | ☐ |
| 11.7 | Download data (JSON) | File with customer, orders and tickets | ☐ |
| 11.8 | Anonymise a customer (Super Admin) | Name, email, notes cleared; orders stay; tickets and returns contact data cleared | ☐ |
| 11.9 | Create personal code from the customer page | Discount form prefilled with the email, one use | ☐ |
| 11.10 | Total spent | Paid orders minus refunded returns (items minus deduction) | ☐ |

## 12. Emails (queue only)
The sender is not connected: check the queue in the database (`email_outbox`) and the "Customer emails" box on the order page.

| ID | Trigger | Expected queued email | Done |
| --- | --- | --- | --- |
| 12.1 | Checkout order, PayPal reported | `order_received` once | ☐ |
| 12.2 | Mark that order paid | `payment_confirmed` once | ☐ |
| 12.3 | Delivery picked up | `order_shipped` once per delivery | ☐ |
| 12.4 | Marking paid twice or repeating the action | No duplicate rows | ☐ |
| 12.5 | Order typed by hand (admin source) | No emails | ☐ |
| 12.6 | Draft order created by staff, then paid | `payment_confirmed` and shipped emails | ☐ |
| 12.7 | Return requested, approved, rejected, received, refunded | One email each; cancelled return none | ☐ |
| 12.8 | Language | Row language equals the checkout language | ☐ |
| 12.9 | Rows stay "pending" | Yes, until the sender is connected | ☐ (sending after connecting) |

## 13. Finance
Run after several tests so there is data. Compare with the orders list.

| ID | Check | Expected | Done |
| --- | --- | --- | --- |
| 13.1 | Period "This month": paid orders | Number equals paid, non-cancelled orders in the period | ☐ |
| 13.2 | Gross − discounts − returns | Equals net sales shown | ☐ |
| 13.3 | Average order value | Items after discounts ÷ paid orders | ☐ |
| 13.4 | "Money to check" | Counts match: reported-but-unpaid PayPal orders, received-not-refunded returns, unpaid exchange differences, preorder balances | ☐ |
| 13.5 | Open purchase orders | Cost of goods ordered, not received | ☐ |
| 13.6 | Rough margin | Needs purchase order unit costs (create a purchase order "TEST supplier"); coverage figure shown | ☐ |
| 13.7 | Export CSV | One row per sale, refund (negative), label cost (negative) and gift card line; opens in Excel; no customer emails | ☐ |
| 13.8 | Gift cards section | Outstanding balance, issued, used, credited back | ☐ |
| 13.9 | Drafts, unpaid and cancelled orders | Not counted as sales | ☐ |
| 13.10 | Customer without finance role | No access | ☐ |

## 14. Analytics, reports and live view
| ID | Check | Expected | Done |
| --- | --- | --- | --- |
| 14.1 | Analytics last 30 days | Summary, chart, top products, categories, customers, discounts, returns, countries, payment methods, tickets all load | ☐ |
| 14.2 | Totals equal Finance for the same period | Same net sales and order count | ☐ |
| 14.3 | Change vs previous period | Percent shown; "no earlier data" when the previous period is empty | ☐ |
| 14.4 | New vs returning | `repeat@test.invalid` counts as returning; a brand new email as new | ☐ |
| 14.5 | Reports: choose some KPIs, a custom period | Preview shows only chosen KPIs | ☐ |
| 14.6 | Export CSV and Print / save as PDF | File has one block per KPI; print page is clean | ☐ |
| 14.7 | Live view: place an order | Within 30 seconds "Orders placed today" and the latest orders update; pause stops updates | ☐ |
| 14.8 | Needs-attention tiles | Counts match payments to confirm, deliveries to hand over, returns, tickets, stock | ☐ |

## 15. Products and collections (admin)
| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 15.1 | Product list columns | Product with SKU and category, price, stock, status, **Edit** button and ⋯ menu | ☐ |
| 15.2 | Filters (category, stock, without image), sort, rows per page | Each works; default 25 rows | ☐ |
| 15.3 | Bulk publish, unpublish, archive, restore | Works; storefront follows | ☐ |
| 15.4 | Create a product; type a title | Storefront address follows the title until edited; duplicate SKU or address gives a plain message | ☐ |
| 15.5 | Edit a product and rename it | **Address stays the same** | ☐ |
| 15.6 | Existing product stock | Read-only numbers (available, on hand, incoming, reserved) with link to Inventory | ☐ |
| 15.7 | Translations: fill German and Vietnamese, save | Storefront shows them in those languages; empty fields fall back | ☐ |
| 15.8 | Images: add, reorder, remove, save | Order kept; removing does not delete other products' images; failed save never leaves a product without images | ☐ |
| 15.9 | Unsaved changes | Warning when leaving; no warning right after saving | ☐ |
| 15.10 | Duplicate a product | Draft copy with stock 0, no images, same translations and weight | ☐ |
| 15.11 | Page check line under the name | Shows what is missing; disappears when fixed | ☐ |
| 15.12 | Collections: create, reorder products, hide, delete | Shop page follows; reserved addresses refused | ☐ |
| 15.13 | "Best sellers" collection after editing | Storefront uses the edited list | ☐ |
| 15.14 | Weight field | Saved; used for label estimates | ☐ |

## 16. Inventory and purchase orders
| ID | Steps | Expected | Done |
| --- | --- | --- | --- |
| 16.1 | Inventory: adjust +5 and −2 with a reason | On hand and available change; movement recorded | ☐ |
| 16.2 | Adjust below zero | Refused | ☐ |
| 16.3 | Purchase order for "TEST supplier": create, order, receive part, receive rest | Incoming goes up then moves to on hand; status partially received → received | ☐ |
| 16.4 | Cancel a purchase order | Remaining incoming released | ☐ |
| 16.5 | Low stock alerts | `TEST-LOW` shows as low stock, `TEST-OUT` as out of stock (Live view, Inventory) | ☐ |
| 16.6 | Stock rules over an order's life | Paid reserves; picked up reduces on hand and reserved; cancel releases | ☐ |
| 16.7 | Return "put back in stock" | On hand increases by the returned quantity once | ☐ |
| 16.8 | Inventory CSV export | Downloads current levels | ☐ |

## 17. Security and abuse checks
In the SQL editor of the **test** project (run `reset role;` afterwards).

| ID | Check | Expected | Done |
| --- | --- | --- | --- |
| 17.1 | `set role anon; select * from public.customers;` | Permission denied or no rows | ☐ |
| 17.2 | `set role anon; select * from public.gift_cards;` | Permission denied or no rows | ☐ |
| 17.3 | `set role anon; select * from public.discounts;` | Permission denied or no rows (codes are secret) | ☐ |
| 17.4 | `set role anon; select * from public.sales_orders;` | Permission denied or no rows | ☐ |
| 17.5 | `set role anon; select * from public.draft_orders;` | Permission denied or no rows | ☐ |
| 17.6 | `set role anon; select * from public.email_outbox;` | Permission denied or no rows | ☐ |
| 17.7 | `set role anon; select public.price_cart('[]'::jsonb,'','',0);` | Permission denied (internal function) | ☐ |
| 17.8 | Browser: change the shipping cost or prices in the request | The server uses its own prices; shipping above 100 refused | ☐ |
| 17.9 | Guess ticket, return and order numbers with a wrong email | Always "not found" | ☐ |
| 17.10 | Open a payment link with a shortened or guessed token | "Not valid" | ☐ |
| 17.11 | Guest tries to call staff functions (create gift card, complete exchange, draft pricing) | Permission denied | ☐ |
| 17.12 | Text fields with `<script>` and with `=cmd` | Shown as text; CSV exports quote them | ☐ |
| 17.13 | Order emails and pages for another customer | Never visible without the right email or sign-in | ☐ |

## 18. Pending connections (run after setup)
| ID | Connection | Check | Done |
| --- | --- | --- | --- |
| 18.1 | PayPal sandbox | Checkout payment, payment link payment and the reference stored on the order | ☐ |
| 18.2 | PayPal refund function | Refund via PayPal refunds the net amount once; pressing twice does not refund twice; partial gift card refunds only the PayPal part | ☐ |
| 18.3 | Sendcloud | Single, bulk and cancel labels; return labels download for the customer; label cost shows | ☐ |
| 18.4 | Email provider | All queued emails are sent in the right language; failed rows can be retried | ☐ |

## 19. Quick smoke test after every release (15 minutes)
1. Sign in as admin: every sidebar page opens without an error.
2. Storefront: product page, add to bag, checkout summary shows the right total.
3. Place a simulated order, mark it paid, create a delivery, pick it up, mark it delivered.
4. Apply `TESTFIXED15` and a gift card to a new order.
5. Create a draft and copy its payment link.
6. Open Finance and Analytics for this month and compare the totals.
7. Open Live view and confirm it refreshes.
