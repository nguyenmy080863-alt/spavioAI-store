# Draft orders

Open **Orders → Drafts**. Use drafts to build an order **for** a customer: phone and in-person orders, a wholesale quote, a custom price. Then either **create the order yourself** or **send the customer a payment link**. Requires migration `0021_draft_orders.sql`. This replaces the old *New order* form: **Create draft** is now the one way to create an order by hand.

A draft is **not an order**. It does not appear in Orders, Finance, Analytics, customer totals or stock until it becomes an order. **Stock is reserved only when the resulting order is paid**, the same rule as every other order.

## Building a draft
1. **Create draft** (Orders or Drafts page). A draft number like `DR-00001` is assigned.
2. **Customer:** search an existing customer (fills name, email, phone and links their account if they have one) or type the details. Guests stay guests. Pick the language used for emails and the payment page.
3. **Delivery address:** optional for a payment link (the customer can fill it in on the payment page), needed before you ship.
4. **Items:** search products by name or SKU and add them. Only published, non-preorder products can be added. Prices are **locked** when you add an item: if the catalogue price changes later, the draft keeps the price it had. **Refresh prices from the catalogue** re-reads them on request.
5. **Shipping:** type a shipping method note and the cost (0 = free).
6. **Discounts:** enter a discount **code**, or leave it empty. Automatic discounts (for example free shipping from a minimum value) apply on their own. The draft uses the **same pricing engine as checkout**, so the summary shows what checkout would. A code that is not valid is shown in red and blocks creating the order.
7. **Notes and tags:** internal only.
8. **Save draft.** The **Summary** on the right shows catalogue value, discounts, shipping and total. Amounts include VAT.

### Custom price and custom discount
- **Custom price** on an item (never above the catalogue price) and a **custom discount** (percentage or fixed amount off the draft) both need a **reason**.
- Only **Super Admins and Order Processors** can set them. The database enforces this, and the changes are audited.
- A **custom discount replaces** codes and automatic discounts (you decide the price yourself, including shipping). Items with a custom price are left out of discounts that skip sale items.
- Refunds and returns use what the customer actually paid, so custom prices and discounts stay correct there. In Finance and Analytics, custom prices and discounts count as discounts.

## Finishing a draft
### Create the order
**Create order** turns the draft into an order (source *Created from a draft order*). Stock is checked at that moment; the order cannot be created if there is not enough.
- **Unpaid:** the order waits for payment. Mark it paid in Orders when the money arrives; that reserves the stock.
- **The customer has already paid:** choose how (bank transfer, cash, card terminal, PayPal outside the store, other) and an optional reference. The order is created already paid and the stock is reserved now.
The customer gets the normal order emails (payment confirmed, shipped) once emails are connected.

### Payment link
**Create link** makes a secret link (valid 1, 3, 7 or 14 days) that you **copy and send yourself**; it is not emailed yet (the email provider is not connected). Needs the customer's name and email.
- The customer opens it, sees the items and total, confirms the delivery address and phone, and pays with **PayPal**. The order is created like a checkout order, so it has the same order emails.
- As in checkout, the order **stays unpaid until you check the payment in PayPal and mark it paid** (the PayPal reference and invoice number are stored on the order). Do not ship before that. Marking it paid completes the draft.
- Opening the link again never creates a second order. A **new link** replaces the old one. After the link starts an order, the draft is locked.
- Status on the Drafts list: *Draft*, *Payment link sent*, *Link expired*, *Customer started payment*, *Order created*.

## Other actions
- **Duplicate:** copies customer and items into a new draft at the current catalogue prices (custom prices are not copied).
- **Delete:** only for drafts that did not create an order.

## Not built yet
- Reserving stock for a draft (stock is only reserved when the order is paid).
- Preorder products in drafts, VAT and legal invoices (the link is a payment request, not an invoice; ask your tax advisor), sending the link by email from the store.
- Payment terms and partial payments.
