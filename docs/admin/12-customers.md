# Customers

Open **Customers**. Every person who interacts with the store gets **one record per email address**, created automatically. Requires migration `0013_checkout_orders_customers.sql`.

## Where customers come from
| Source | When the record is created |
| --- | --- |
| Order | Someone places an order at checkout, or you create an order by hand |
| Account sign-up | Someone creates an account |
| Warranty ticket | Someone opens a warranty or support ticket |
| Added by hand | You press **Add customer** |

If the same email shows up again (a guest who later signs up, an order after a ticket) it updates the same record; it never creates a duplicate.

**Guests and accounts.** A guest checks out or opens a ticket without an account. The store never creates an account for a guest and never emails them. The list marks each customer as **Account** or **Guest**. An account is linked to the customer record only when the order or sign-up email is the account's own email.

## The list
- Search by name, email, phone or tag.
- Columns: account or guest, marketing status, number of paid orders, total spent, last purchase, tags. A customer with open warranty tickets shows a note.
- **Total spent** counts paid orders that were not cancelled, with shipping included. Refunded orders do not count, and refunded returns are subtracted.

## Segments
Pick a segment in the filter next to the search box. Segments update by themselves as orders change.

| Segment | Who is in it |
| --- | --- |
| All customers | Everyone |
| High spenders | Total spent at or above an amount you type (default 500 EUR) |
| No purchase in 180 days | Bought at least once, and the last paid order is older than 180 days |

More segments will be added later (for example by device owned or warranty end date).

## Export
**Export CSV** downloads the customers currently shown (email, name, phone, consent, orders, total spent, last purchase, tags). By default only customers who **agreed to marketing emails** are exported; untick the box if you need the full list for internal use. Every export is written to the audit log. Emails are not sent from the store; use the CSV in your mailing tool.

## Customer page
- Edit name, phone, **tags** (comma separated) and internal notes.
- See orders and warranty tickets with the same email, and the paid-order count and total.
- **Marketing consent** is recorded when the customer ticks the box at checkout or sign-up. Tick or untick it by hand only when a customer tells you so; the date and source are stored. An order without the checkbox never removes an existing consent.

## Privacy
- **Download data (JSON)** gives you everything stored about the customer, for an access request.
- **Anonymise customer** (Super Admin only) is the erasure request. It wipes name, email, phone, notes, tags and consent, unlinks the account, and removes the contact details on the customer's warranty tickets. **Orders are kept** for bookkeeping. This cannot be undone.
- Skin or hair concerns are health-related. Do not store them in notes or tags unless the customer asked you to.
