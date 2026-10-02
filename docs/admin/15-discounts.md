# Discounts

Open **Discounts**. Create **discount codes** (the customer types a code) and **automatic discounts** (applied by themselves when the bag qualifies). Requires migrations `0017_discounts.sql` and `0018_discounts_phase2.sql`. The **Flash sale** countdown lives under Discounts too, but it is a separate display feature (see its page).

## Two methods
| Method | How the customer gets it | Good for |
| --- | --- | --- |
| **Discount code** | Types the code in the promo box at checkout, or opens a **share link** `…/discount/CODE` (the code is remembered and applied at checkout) | Newsletter and Instagram campaigns, partners and influencers (one code each, so you can see what each brings in), welcome offers |
| **Automatic** | Nothing to do; it applies when the conditions are met | Seasonal sales, "free shipping from €99" |

## Four types
- **Buy X Get Y**: the customer buys X items from a set and gets Y items at a percentage off (100 % = free). Examples: *buy 2 get 1 free* of the same product, or *buy a device, get a gel free*. Choose the items to buy (any, categories or products) and either "the same items" or a separate reward set. The cheapest eligible reward items are discounted. Optional cap: most reward items per order. For separate sets choose clearly different items.
- **Percentage off** or **fixed amount off**, applied to the **entire order**, **specific categories** or **specific products**. A fixed amount is taken off the eligible items once per order and never exceeds their value.
- **Free shipping**, optionally from a minimum bag value (measured after any discount). The old hard-coded 99 € threshold in the checkout page is gone: it is now an automatic discount called *Free shipping from 99 EUR* that the migration creates. Edit or switch it off here.

## Conditions
- **Minimum spend** and **minimum number of items** (counted on the eligible items).
- **Do not apply to products already on sale** (on by default). Example: a device costs €200 and is on sale for €160. A 10 % code leaves it at €160 when this is ticked, and makes it €144 when it is not.
- **Preorder items never get discounts** (the customer only pays a deposit today).
- **Customers (segments):** everyone, **new customers**, **returning customers** (at least one earlier paid order), **high spenders** (total spent at least an amount you set), **lapsed customers** (bought before but not in the last N days) or **customers with a tag** (tags are set on the customer page). Rules are matched by the email used at checkout, so they work for guests, and they are checked when the order is placed. The totals match the Customers page.
- **Personal code:** put a customer's email on a code and only that email can use it. The customer page has a **Create personal code** button that prefills it (one use, once per customer). Nothing is emailed from the store; send the code yourself.
- **Total uses** limit and **once per customer** (matched by email, so it works for guests too). Cancelled orders, and unpaid orders older than two hours, do not count as a use, so abandoned payment windows cannot use up a limited code.
- **Active period** (start and optional end) and a **Switched on** switch.

## How discounts combine
Every discount is in one **class**:
- **Product:** amount off chosen products or categories, and Buy X Get Y.
- **Order:** amount off the entire order.
- **Shipping:** free shipping.

Rules:
1. Two discounts of the **same class never combine** (the customer gets the better one; on a tie a typed code wins).
2. Two discounts of **different classes combine only if both allow it**. Each discount has *Can combine with product / order discounts / free shipping* checkboxes (the form only shows the other classes).
3. Product discounts are applied first, then order discounts on what is left, then free shipping.

Defaults keep the phase 1 behaviour: an amount-off discount combines with free shipping, but not with another amount-off discount. Tick the boxes on **both** discounts to let a product discount and an order discount stack. If a typed code cannot be combined with what already applies, the customer is told.

## Where prices are calculated
Everything is calculated on the **server** (`price_cart` in the migration). The checkout page only shows the server's answer, and the order is created with the same calculation, so the price shown is the price charged. If a code stopped working between typing it and paying (expired, used up), checkout stops with a message instead of charging a different amount.

## Orders, refunds and reports
- Each order stores the code(s), the amount saved and any waived shipping. The order page shows them; item prices on the order are **after** the discount.
- **Returns refund what the customer actually paid**, because the discounted price is the item price stored on the order. Exchanges and customer "total spent" use the same prices.
- The discount list shows **uses**, **given away** (paid orders only) and **revenue** per discount.
- Order emails show the discount line.
- Who may change discounts: Super Admin and Inventory Manager. Order Processors can see them.

## Tips
- Use hard-to-guess codes for private campaigns (**Generate** makes one like `GLOW-7K2Q`). Codes are not case sensitive. Customers can never read the list of codes.
- Switch a used discount off instead of deleting it: discounts already used on orders cannot be deleted.
- Not built yet: tiered discounts, automatic bulk generation of personal codes, emailing codes from the store.

## Legal notes (check with your lawyer or tax advisor)
These are practical flags, not legal advice.
1. **"Was / now" prices (Preisangabenverordnung, § 11, from the EU Omnibus directive).** When you advertise a price reduction against a previous price, you must show the **lowest price of the last 30 days** as the reference. The store shows the regular price crossed out next to a sale price, but it does **not** track the 30-day lowest price. Check this before running long-lasting sale prices or "was" prices. A code that is simply entered at checkout is different from an advertised reduction, but "20 % off" advertising can still fall under the rule.
2. **Flash sale (fake urgency).** The Flash sale page can show **invented stock levels and simulated purchases**, and the countdown is a browser timer that restarts. Telling customers an offer ends soon or stock is almost gone when that is not true is misleading under the UWG and the EU Unfair Commercial Practices Directive, and competitors can send warning letters (Abmahnung). Use it only with real end dates and real stock, or turn the fake stock and purchase simulation off.
3. **Sending codes by email.** Marketing emails with codes need the customer's consent (UWG § 7; double opt-in is the safe standard). The Customers page records consent, and its CSV export only includes customers who agreed by default.
4. **Terms of service.** List the conditions in your terms: one amount-off discount per order, no cash value, not valid on sale or preorder items (when that is how you set it), validity period, and that codes can be withdrawn.
5. **Returns and withdrawal.** The refund must be what the customer paid (the system does this). Do not claw back a free-shipping or discount benefit in a way that makes the withdrawal more expensive for the customer beyond what your terms and the law allow.
6. **VAT.** Consumer prices include VAT, and discounts reduce the gross price. The store does not create invoices; ask your tax advisor how discounts must appear on invoices.
