# Returns, labels, refunds and exchanges

Open **Returns**. Customers (with or without an account) can send back a device within the **30-day trial**, either for a **refund** or an **exchange** for another device. Requires migrations `0015_returns.sql` and `0016_return_labels_refunds_exchanges.sql`.

> **Status.** The whole process works in the admin panel and the store today. Three connections are **pending** and have to be set up before the automatic parts work: **emails** (provider), **PayPal refunds** (API credentials) and **prepaid labels** (Sendcloud keys on the server). Until then you do those steps by hand (see *Pending setup*). Nothing breaks without them.

## What the customer can do
- Open **Returns** in the footer (`/returns`), or press **Return items** on their orders page. They enter order number and email, choose items and quantities, choose **Refund** or **Exchange** (and the replacement device for each item), give a reason and confirm the device is complete and in its original packaging.
- Follow the return at `/returns/track`: status, message from you, **download of the prepaid label**, the refund breakdown, the tracking number of their parcel. They can cancel while it is still *Requested*.
- Emails (once connected, see Order emails): request received, approved, label ready, rejected, parcel received, refunded / exchange completed.

## Rules the system enforces
- The order number and email must match, and the order must be **paid** and not cancelled.
- Only **delivered** items can be returned, within **30 days of their delivery**. An item can only be returned once; a rejected or cancelled request frees it.
- Exchanges: the replacement must be in stock and not a preorder.
- The window length is set in one place: `return_window_days()` in migration 0015 and `RETURN_WINDOW_DAYS` in `src/lib/returns.ts`. Change both together.

## Status flow
| Status | Meaning | Your action |
| --- | --- | --- |
| Requested | New, waiting for you | **Approve**, or **Reject** (a message to the customer is required) |
| Approved | Customer sends the parcel back | **Create prepaid label**, then **Mark parcel received** |
| Received | Parcel is with you | Inspect, then **refund** (refund) or **create the replacement order** (exchange); optionally **put items back in stock** |
| Refunded (shown as *Completed* to the customer for exchanges) | Finished | none |
| Rejected / Cancelled | Finished | none |

## Prepaid return labels and who pays
- **Create prepaid label** (on an approved return) asks Sendcloud for a return label addressed to your warehouse. The customer downloads it from their return page and gets the tracking number.
- **We pay for the label.** The cost is recorded on the return as *cost to us* (taken from the Sendcloud price list for the method; check your Sendcloud invoice for the exact amount). It is a business cost: it is **not** charged to the customer unless you switch on the deduction below.
- **Deducting the label cost.** You can take the label cost off the refund in two ways:
  - **Store setting** (top of the Returns page, Super Admin only): *Deduct the prepaid return label cost from refunds*. Default **off**. When **on**, the cost is deducted automatically when a label is created.
  - **Per return:** the *Deduction* field and the **Deduct label cost** button on the return page. You can type any amount (up to the items value).
- **Never for defective or wrong items.** If the reason is *Defective* or *Wrong item received*, the cost is not deducted automatically and the button is hidden: the seller bears the return cost in those cases.
- **Tell customers first.** When the setting is on, the return page shows the deduction before the customer submits (EU rules require telling customers about return costs beforehand). **Update your terms and returns text** (`legal.json`, FAQ) when you turn it on.
- The deduction is shown to the customer on their return page and in the refund email, and it is subtracted from what you refund.

## Refunds
- **Refund amount** starts as the value of the returned items (shipping is not refunded). Change it before refunding if needed. **Net refund = items value − deduction.**
- **Refund via PayPal** (button on a *Received* return) sends the refund through PayPal, records the PayPal refund ID and marks the return refunded. It is safe to press twice: PayPal ignores the repeat.
- **Mark as refunded (done by hand)** is the alternative: refund in PayPal yourself, enter the refund ID, press the button. This is what you use until PayPal is connected.
- A refunded return reduces the customer's **Total spent** by what they kept back (items value − deduction).

## Exchanges
- The customer picks a replacement device for each returned item. The price of the replacement is fixed when they submit the request.
- **Settlement = value of the replacements − (value returned − deduction).**
  - Positive: the customer owes the difference. The replacement order is created **unpaid**; collect the difference (for example with a PayPal payment request) and press **Mark as paid** on that order.
  - Zero: nothing to pay or refund; the replacement is ready to ship at once.
  - Negative: the replacement is ready to ship at once and you **refund the difference** (button *Refund difference via PayPal*, or by hand).
- After the parcel is received press **Create replacement order**. It checks stock, creates a new order (source *exchange*, shipping free, same address), and, if nothing is owed, marks it paid so stock is reserved. Ship it from **Orders** like any order; the customer gets the normal shipping email.
- Return label rules and deduction apply to exchanges in the same way.

## Effects elsewhere
- Anonymising a customer also wipes the contact details on their returns.
- Preorders: if the order still had a balance due at shipping, the page warns you. Check what was actually paid before refunding the full item value.
- A faulty device can use a return or the warranty. The return form points customers with a defect to the warranty page.

## Pending setup (to finish the whole process)
These steps need your accounts, so they are not done yet. Nothing is lost while they are pending.

**1. PayPal refunds (`refund-return`)**
1. In the PayPal developer dashboard create a REST app (sandbox first) and copy its Client ID and Secret.
2. Deploy: `supabase functions deploy refund-return`
3. Secrets: `supabase secrets set PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... PAYPAL_ENV=sandbox` (use `live` for real money).
4. Test with a sandbox order: pay at checkout, mark it paid, return it, press **Refund via PayPal**.
Until then the button answers "PayPal is not connected yet" and you refund by hand. The function finds the payment through the PayPal order ID stored on the order, so it only works for orders paid with PayPal at checkout.

**2. Prepaid labels (`create-return-label`, `get-return-label`)**
1. In Sendcloud (Settings > Integrations > API) create an API key pair, and make sure return shipping methods are enabled for your carrier.
2. Deploy: `supabase functions deploy create-return-label` and `supabase functions deploy get-return-label --no-verify-jwt` (guests download labels without an account; access is protected by return number + email).
3. Secrets: `supabase secrets set SENDCLOUD_PUBLIC_KEY=... SENDCLOUD_SECRET_KEY=... RETURN_ADDRESS_NAME="Spavio AI Store" RETURN_ADDRESS="Street 1" RETURN_CITY=Berlin RETURN_POSTAL_CODE=10115 RETURN_COUNTRY=DE`. Optional: `RETURN_EMAIL`, `RETURN_PHONE`, `SENDCLOUD_RETURN_METHOD_ID` (pick a specific method), `RETURN_PARCEL_WEIGHT_KG` (default 2).
4. Test: approve a return and press **Create prepaid label**.
Until then the button says Sendcloud is not connected; approve with instructions and let the customer send the parcel themselves.

**3. Emails (`send-order-emails`)** Follow *Order emails* (docs 13). Return and exchange emails use the same queue and the same function, so no extra setup.

**Security note.** The older checkout code reads `VITE_SENDCLOUD_PUBLIC_KEY` and `VITE_SENDCLOUD_SECRET_KEY` in the browser. Anything with a `VITE_` prefix is visible to every visitor, so the Sendcloud **secret key should not be set there**. The new return functions keep the keys on the server. Plan to move the outgoing-parcel calls to a server function as well.

## Not built yet
- Automatic PayPal refunds for orders paid by card or Klarna (those payments are still simulated).
- Collecting an exchange price difference automatically (today you collect it and mark the replacement order paid).
- A restocking fee or partial-condition refunds beyond the free-form deduction field.
