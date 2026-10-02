-- REMOVES the data created by test-data.sql and by testing. For a SEPARATE test project only.
--
-- It deletes only rows that are marked as test data:
--   orders, deliveries, returns, drafts, tickets and customers whose email ends with @test.invalid
--   products whose SKU starts with TEST-, discounts whose name starts with TEST, gift cards whose code
--   starts with GC-TEST- or whose note starts with TEST, the collection test-collection, and purchase
--   orders whose supplier name starts with TEST.
-- Stock counts of real products used in tests are NOT restored (use TEST- products for tests).
-- The audit log is kept. Users, roles and the real catalogue are not touched.

-- Orders and everything hanging off them
CREATE TEMP TABLE _test_orders AS
SELECT id FROM public.sales_orders WHERE customer_email LIKE '%@test.invalid';

DELETE FROM public.gift_card_transactions
WHERE sales_order_id IN (SELECT id FROM _test_orders)
   OR gift_card_id IN (SELECT id FROM public.gift_cards WHERE replace(code, '-', '') LIKE 'GCTEST%' OR note ILIKE 'TEST%');
DELETE FROM public.gift_cards WHERE replace(code, '-', '') LIKE 'GCTEST%' OR note ILIKE 'TEST%';

DELETE FROM public.return_requests WHERE sales_order_id IN (SELECT id FROM _test_orders) OR customer_email LIKE '%@test.invalid';
DELETE FROM public.delivery_orders WHERE sales_order_id IN (SELECT id FROM _test_orders);
DELETE FROM public.sales_orders WHERE id IN (SELECT id FROM _test_orders);   -- items, redemptions and queued emails go with them

-- Drafts (an order created from a draft is gone now, so the draft can be deleted)
DELETE FROM public.draft_orders WHERE customer_email LIKE '%@test.invalid' OR tags @> ARRAY['test'];

-- Support tickets and customers
DELETE FROM public.warranty_tickets WHERE customer_email LIKE '%@test.invalid';
DELETE FROM public.customers WHERE email LIKE '%@test.invalid';

-- Purchase orders for test products, then discounts, collection, products
DELETE FROM public.purchase_orders WHERE supplier_name ILIKE 'TEST%';
DELETE FROM public.discounts WHERE name ILIKE 'TEST%';
DELETE FROM public.collections WHERE slug = 'test-collection';
DELETE FROM public.products WHERE sku LIKE 'TEST-%';

DROP TABLE _test_orders;
