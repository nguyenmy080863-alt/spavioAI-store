# Finance

Open **Finance**. A simple overview of sales, refunds and costs for a period, a list of money you still need to check, and a CSV export for your accountant. It only **reads**; nothing here changes an order or moves money. Requires migration `0019_finance.sql`.

**Who can see it:** Super Admin and Order Processor. Other roles get an error. The numbers are protected in the database, not just hidden in the menu.

All amounts are in EUR and **include VAT**. The store does not calculate VAT or create invoices; ask your tax advisor how to report it.

## Period
Choose *This month*, *Last month*, *Last 30 days*, *This year* or *Custom dates*. Periods use your browser's local time.

## What the numbers mean
| Number | Meaning |
| --- | --- |
| **Gross sales** | List price × quantity of the items in paid orders (not cancelled), dated by the day the order was marked paid |
| **Discounts** | What discounts took off those items |
| **Returns** | Value of returned items for returns marked refunded in the period (items value minus the label deduction we kept) |
| **Net sales** | Gross sales − discounts − returns |
| **Paid orders / Average order value** | Number of paid orders, and items after discounts divided by orders |
| **Shipping charged** | Shipping customers paid. It is **not** part of net sales |
| **Collected from customers** | What customers paid at checkout: items (or preorder deposits) plus shipping |
| **Cash refunded** | What was actually paid back, for example by the PayPal refund |
| **Return labels we paid** | Cost of prepaid return labels created in the period (Sendcloud price list; your Sendcloud invoice is exact) |
| **Label costs kept from refunds** | Deductions taken from refunds to cover label costs |

Exchanges: the replacement order counts as a sale and the returned items count as a return, so net sales stay correct.

## Money to check (right now)
These are not tied to the period; they show what needs attention today, each with a link:
- **Payments to confirm:** the customer finished PayPal but the order is not marked paid yet. Check PayPal and mark it paid.
- **Refunds waiting:** parcels received that are not refunded yet.
- **Exchange differences owed:** replacement orders waiting for the customer to pay the difference.
- **Preorder balances to collect:** paid deposits where the balance is charged when the items ship.

## Gift cards
Outstanding balance (money you still owe in goods), cards issued in the period, value used on orders, and value credited back to cards (cancelled orders and returns). Gift cards are not revenue when issued; the revenue is the order they pay for. Orders paid with a card show a lower "collected" amount, because that part is not cash. See *Gift cards*. Needs migration `0024_gift_cards.sql`.

## Suppliers
**Open purchase orders**: how many, and the cost of goods ordered but not received yet.

## Rough margin (estimate)
Estimated cost of goods = items sold × the **average unit cost** from your purchase orders (ordered or received). The page shows the margin on items that have a cost and a **coverage** figure (how many sold items have a purchase order cost).
- It is only as good as your purchase orders. Enter unit costs there.
- It ignores returns, shipping, label costs, PayPal fees and advertising.
- Products without a purchase order cost are left out, so check the coverage before trusting the percentage.

## Export transactions (CSV)
**Export transactions (CSV)** downloads one row per:
- **Sale** (paid order, dated when marked paid),
- **Refund** or **Exchange credit** (negative, dated when refunded),
- **Return label cost** (negative, dated when the label was created).

Columns: date, type, reference, order, customer name, payment method and reference, items gross, discount, shipping, order total, cash received, return value, cash refunded, return label cost, gift card amount, discount code. Gift card lines (issued, used, credited back) are included with the card code masked to its last 4 characters. Amounts use a dot as decimal separator, refunds and costs are negative. Customer emails are not included. The file opens correctly in Excel. Every export is written to the audit log.

## Not built yet
- VAT calculation, invoices and tax reports.
- PayPal fee tracking and payout reconciliation (needs the PayPal connection).
- Product costs on products, profit and loss, advertising costs.
- A printable monthly summary.
