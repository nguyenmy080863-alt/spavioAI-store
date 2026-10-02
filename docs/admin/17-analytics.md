# Analytics and reports

Requires migration `0020_analytics.sql`. Any team member can open these pages. All amounts include VAT. Periods use your browser's local time. The numbers follow the same rules as **Finance**: a sale is a paid order that is not cancelled, dated by the day it was marked paid; net sales = gross sales − discounts − returns.

## Analytics (main page)
Open **Analytics**. Pick a period (*Last 30 days* by default, or this month, last month, this year, custom dates). The summary cards show the **change versus the previous period** of the same length. The page shows the KPIs below.

| KPI | What it shows |
| --- | --- |
| **Sales summary** | Net sales, gross sales, discounts, returns, paid orders, average order value |
| **Sales over time** | Net sales (bars) and orders (line) per day, week or month, chosen automatically from the period length |
| **Products** | Top 10 products by revenue (after discounts), and published products with no sales |
| **Sales by category** | Revenue and units per category |
| **Customers** | New vs returning customers, returning share, revenue from each, orders by signed-in customers vs guests |
| **Discount performance** | Per discount: uses, money given away, order revenue; share of orders that used a discount |
| **Returns** | Return requests, exchanges, return rate (requests per paid order), days to refund, return reasons |
| **Sales by country and city** | From the shipping address |
| **Sales by payment method** | PayPal, card, manual |
| **Warranty tickets** | Opened, resolved, average days to resolve, by type |

How customers are classified: **new** = the customer's first ever paid order is inside the period; **returning** = they had paid before the period. Customers are matched by email, so guests count too. Orders typed in by hand without an email are left out of the customer figures.

**Not tracked yet:** visitors, sessions, conversion rate, traffic sources, cart and checkout steps, product page views, device. These need visitor tracking, which the store does not have. It would also need cookie consent for analytics.

## Reports
Open **Analytics → Reports**. A report is the same KPIs, exported for a time range you choose.
1. Tick the KPIs to include (or *Select all*).
2. Choose the period, and for *Sales over time* the step (automatic, day, week or month).
3. Check the **preview**.
4. **Export CSV** downloads one file with a block per KPI (opens correctly in Excel), or **Print / save as PDF** opens a clean print page; choose "Save as PDF" in the print dialog.

Each export is written to the audit log (which KPIs, which period). Customer emails are never part of a report.

## Live view
Open **Analytics → Live view**. It refreshes every 30 seconds (press *Pause updates* to freeze it).
- **Today so far:** revenue, paid orders, average order value and orders placed (paid or not), each compared with **yesterday up to the same time of day**, plus the orders placed in the last hour.
- **Paid orders per hour today.**
- **Needs attention right now:** payments to confirm, deliveries to hand over, returns to review, refunds waiting, new and open warranty tickets, out-of-stock and low-stock products. Each tile links to where you act and turns amber when it is above zero.
- **Latest orders** with payment status.
- Below: **catalogue health** (published, drafts, low stock, stock value), low-stock alerts and recent admin activity.

## Not built yet
- Visitor and conversion metrics (needs visitor tracking and a consent decision).
- Scheduled or emailed reports.
- Comparing two custom periods side by side, saved reports.
