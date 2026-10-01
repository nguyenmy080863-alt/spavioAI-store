# Overview

The first page of the admin (`/admin`). It answers "what needs doing today?".

## Needs attention
Cards with a count, each linking to the page where you act. A card at 0 shows "All clear".
- **Paid orders to fulfil:** paid orders with items not yet in any delivery.
- **Deliveries to hand over:** deliveries still *Preparing*.
- **Unpaid for over 24 h:** open orders that are still unpaid.
- **Overdue purchase orders:** ordered or partially received, past the expected date.
- **Out of stock / Low stock:** based on available quantity and each product's low-stock threshold.

## Sales summary
Today, last 7 days and last 30 days: revenue, number of orders and average order value, with the change against the previous equal period (today is compared with yesterday).

Revenue counts orders that are **paid and not cancelled**, dated by when they were paid.

## Recent orders
The last five orders with payment status, status, total and date.

> The numbers are calculated in the browser from all orders. This is fine at small volumes; with thousands of orders they should move to database queries.
