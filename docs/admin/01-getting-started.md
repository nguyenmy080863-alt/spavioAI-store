# Getting started

## Connect Supabase
1. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Run the SQL files in `drizzle/migrations/` in order in the Supabase SQL editor. `0011_inventory_orders.sql` creates the inventory, purchase order, sales order and delivery tables; without it the Orders, Purchase orders and Overview pages show an error.
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
| Customers, Warranty, Returns, Finance | — | Planned |
| Discounts | Flash sale | Flash sale built |
| Analytics | Reports, Live View | Live View built (the former dashboard); Reports planned |
| Store settings | Hero banner, Team & roles, Audit log | Built (Flash sale moved to Discounts) |
| Docs | For customers, For admins | Built |

Supplier is a plain text field on purchase orders (there is no supplier table yet).

Sections marked *Planned* show a "coming soon" page. Navigation is configured in `src/components/admin/adminNav.ts`.
