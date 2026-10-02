# Getting started

## Connect Supabase
1. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Run the SQL files in `drizzle/migrations/` in order in the Supabase SQL editor. `0011_inventory_orders.sql` creates the inventory, purchase order, sales order and delivery tables; without it the Orders, Purchase orders and Overview pages show an error. `0012_warranty_tickets.sql` creates the warranty ticket tables and functions; without it the Warranty page shows an error. `0013_checkout_orders_customers.sql` makes checkout store orders and creates the customer records; without it checkout cannot save orders and the Customers page shows an error. `0014_order_emails_account_orders.sql` adds the order email queue and the customer order pages. `0015_returns.sql` adds returns; without it the Returns page shows an error. `0016_return_labels_refunds_exchanges.sql` adds return emails, labels, the refund deduction, PayPal refunds and exchanges.
3. Restart `npm run dev` (Vite reads `.env` only at startup).

Without a `.env` the store runs on the bundled catalog and login/admin are disabled.

## First login
Sign up at `/login`. The **first account** on a fresh install becomes **Super Admin** automatically. Later accounts have no role until a Super Admin grants one on the Team page.

## Navigating the admin
The sidebar has these sections. Clicking a section opens its main page; its sub-sections appear below.

| Section | Sub-sections | Status |
| --- | --- | --- |
| Overview | — | Built: needs attention, sales summary, recent orders |
| Orders | Drafts, Shipping labels | Orders and deliveries built |
| Products | Collections, Inventory, Purchase orders, Transfers, Gift cards | Products, Collections (draft), Inventory, Purchase orders built; Transfers and Gift cards planned |
| Warranty | — | Built: support tickets from customers and guests (no emails yet) |
| Customers | — | Built: customer records, tags, segments (high spenders, no purchase in 180 days), CSV export |
| Returns | — | Built: returns and exchanges, prepaid labels, refund deduction, PayPal refunds (PayPal, Sendcloud and email connections pending) |
| Finance | — | Planned |
| Discounts | Flash sale | Flash sale built |
| Analytics | Reports, Live View | Live View built (the former dashboard); Reports planned |
| Store settings | Hero banner, Team & roles, Audit log | Built (Flash sale moved to Discounts) |
| Docs | For customers, For admins | Built |

Supplier is a plain text field on purchase orders (there is no supplier table yet).

Sections marked *Planned* show a "coming soon" page. Navigation is configured in `src/components/admin/adminNav.ts`.
