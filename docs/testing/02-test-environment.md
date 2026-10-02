# Test environment and dummy data

Goal: test every feature with dummy products, customers and orders **without touching the real store**.

## The safe way: a separate test project (recommended)
The store reads its database from `VITE_SUPABASE_URL` in `.env`. Point a second copy of the app at a **second, empty Supabase project** and everything you do in tests (orders, refunds, deleting products) stays there.

1. **Create a new Supabase project** (free plan is fine) named for example `spavio-test`.
2. **Apply all migrations** `drizzle/migrations/0000` … `0024` in order in its SQL editor (the same way as for the live project). `0008` adds the demo catalogue; that is fine in a test project.
3. **Create `.env.test`** from [.env.test.example](../../.env.test.example) with the test project's URL and publishable key and a **PayPal sandbox** client id. The file is ignored by git.
4. **Run the app against it:** `npm run dev -- --mode test`. The `.env.test` values replace the ones in `.env`, so the live project is not used. Check the browser's network tab once: requests must go to the test project URL.
5. **Create test accounts** (sign up in the app with these emails, then give them roles in the SQL editor):
   - `admin@test.invalid` → Super Admin (the first account on a fresh project becomes Super Admin automatically)
   - `processor@test.invalid` → Order Processor
   - `inventory@test.invalid` → Inventory Manager
   - `customer@test.invalid` → no role (a normal customer)
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'order_processor' from auth.users where email = 'processor@test.invalid'
   on conflict do nothing;      -- use 'inventory_manager' for the inventory account
   ```
   (If email confirmation is on in the test project, switch it off in Supabase Authentication settings for testing, or confirm the addresses in the dashboard.)
6. **Load the dummy data:** run [drizzle/seed/test-data.sql](../../drizzle/seed/test-data.sql) in the test project's SQL editor. It adds test products, discounts, customers with history, a collection and gift cards (see below). It refuses to run if the database already has non-test orders.
7. **Test the payment flow with PayPal Sandbox:** create a sandbox business and a sandbox buyer account in the PayPal developer dashboard and use the buyer account at checkout. Never use real PayPal accounts in tests.
8. **Reset when you want a clean start:** run [drizzle/seed/test-data-cleanup.sql](../../drizzle/seed/test-data-cleanup.sql) (removes everything marked as test data), then the seed again. Or simply delete the test project and create a new one; that is the cleanest reset.

### Rules that keep the data tidy
- Use **@test.invalid** emails for every order, ticket and sign-up (for example `anna@test.invalid`). The cleanup finds test data by that ending.
- Order only **TEST- products** (SKU starts with `TEST-`). Stock changes on other products are not undone by the cleanup.
- Name suppliers in purchase orders **"TEST …"**, and start the note of gift cards you issue with **"TEST"**.

## What the seed creates
| Item | Details |
| --- | --- |
| **Products** | `TEST-DEVICE-A` Glow Device €150 (20 in stock) · `TEST-DEVICE-B` Sculpt Wand €200, on sale €160 (10) · `TEST-GEL` Conductive Gel €20 (100) · `TEST-LOW` €80 (2 in stock, low-stock alert) · `TEST-OUT` €60 (0 in stock) · `TEST-PRE` preorder €300 with 20 % deposit · `TEST-DRAFT` unpublished draft €99. All have weights. |
| **Discount codes** | `TESTWELCOME10` 10 % for new customers, once per customer · `TESTFIXED15` €15 off from €100 · `TESTGLOW20` 20 % off the Glow Device only · `TESTSALE10` 10 % including sale items · `TESTSHIP` free shipping · `TESTVIP15` 15 % for customers tagged vip · `TESTPERSONAL25` €25 only for vip@test.invalid, one use · `TESTLIMIT2` 5 %, 2 uses in total · `TESTEXPIRED` expired. **Automatic:** buy 2 gels, get 1 free. (The live-store rule "Free shipping from €99" also exists.) |
| **Customers** | `vip@test.invalid` (tag vip, one paid order of €600, agreed to marketing) · `lapsed@test.invalid` (one paid order 200 days ago) · `repeat@test.invalid` (two paid orders, agreed to marketing) · `newbie@test.invalid` and `guest@test.invalid` (no orders) |
| **Collection** | `/category/test-collection` with the Glow Device and the Gel |
| **Gift cards** | `GC-TEST-TEST-TEST-0001` €50 · `…-0002` €10 · `…-0003` expired · `…-0004` switched off |

The four historical orders are paid and back-dated, so Analytics, Finance and the customer segments have data from day one. They also reserve some stock of the test products.

## Other ways (and why they are second choice)
- **Same project, marked data:** the markers above make cleanup possible, but one wrong click (deleting a product, changing stock, a real customer ordering during your test) touches real data. Only acceptable for very small checks.
- **Local Supabase** (`supabase start` with Docker): free and fully isolated, but needs Docker and setup. Good if you will test often.
- **Supabase branching** (paid plans): a copy of the live database for each branch.

## What cannot be tested yet
Features that depend on connections that are not set up: real emails (the queue in `email_outbox` can be inspected instead), Sendcloud labels (the "not connected" messages can be tested), PayPal refunds (the "not connected" messages can be tested). The test plan marks these "after connecting".
