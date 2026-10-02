-- TEST DATA for a SEPARATE test Supabase project. Never run this on the live store.
--
-- Run it in the SQL editor of the test project after all migrations (0000 to 0024) are applied.
-- Safe to run more than once. Everything it creates is marked so the cleanup script can remove it:
--   products        SKU starts with TEST-
--   customers       email ends with @test.invalid
--   discounts       name starts with TEST
--   gift cards      code GC-TEST-TEST-TEST-000x
--   collection      slug test-collection
-- While testing, use @test.invalid emails for every order, ticket and sign-up, so the cleanup finds them.
--
-- Safety guard: refuses to run if the database already has an order that is not a test order.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sales_orders WHERE customer_email <> '' AND customer_email NOT LIKE '%@test.invalid'
  ) THEN
    RAISE EXCEPTION 'This database has orders that are not test orders. Test data belongs in a separate test project.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Products (prices include VAT)
-- ---------------------------------------------------------------------------
INSERT INTO public.products
  (slug, name, sku, category, effect, description, editors_notes, price, sale_price, stock, low_stock_threshold,
   is_new, status, preorder_enabled, preorder_deposit_type, preorder_deposit_value, preorder_release_date, weight_grams)
VALUES
  ('test-glow-device', 'Test Glow Device', 'TEST-DEVICE-A', 'Skincare Devices', 'Radiance',
   'A test LED device used to check checkout, discounts, shipping labels and returns end to end.', 'Test notes.',
   150.00, NULL, 20, 5, true, 'published', false, 'fixed', 0, NULL, 600),
  ('test-sculpt-wand', 'Test Sculpt Wand', 'TEST-DEVICE-B', 'Skincare Devices', 'Firming',
   'A test device that is on sale, used to check that discounts skip sale items by default.', 'Test notes.',
   200.00, 160.00, 10, 5, false, 'published', false, 'fixed', 0, NULL, 450),
  ('test-conductive-gel', 'Test Conductive Gel', 'TEST-GEL', 'Skincare Devices', 'Care',
   'A test consumable used for Buy X Get Y offers and low-value orders.', 'Test notes.',
   20.00, NULL, 100, 10, false, 'published', false, 'fixed', 0, NULL, 150),
  ('test-low-stock', 'Test Low Stock Device', 'TEST-LOW', 'Hair Removal', 'Smooth',
   'A test device with only two units, used to check stock limits and low-stock alerts.', 'Test notes.',
   80.00, NULL, 2, 5, false, 'published', false, 'fixed', 0, NULL, 500),
  ('test-out-of-stock', 'Test Out Of Stock Device', 'TEST-OUT', 'Hair Removal', 'Smooth',
   'A test device with no stock, used to check that it cannot be ordered.', 'Test notes.',
   60.00, NULL, 0, 5, false, 'published', false, 'fixed', 0, NULL, 400),
  ('test-preorder', 'Test Preorder Device', 'TEST-PRE', 'Body & Wellness', 'Tone',
   'A test preorder with a 20 percent deposit, used to check deposits and the balance due.', 'Test notes.',
   300.00, NULL, 0, 5, false, 'published', true, 'percent', 20, (now() + interval '60 days')::date, 900),
  ('test-draft-product', 'Test Draft Product', 'TEST-DRAFT', 'Body & Wellness', 'Tone',
   'A test product that is not published, used to check previews and that customers cannot see drafts.', 'Test notes.',
   99.00, NULL, 5, 5, false, 'draft', false, 'fixed', 0, NULL, 300)
ON CONFLICT (sku) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Discounts
-- ---------------------------------------------------------------------------
INSERT INTO public.discounts (name, method, code, type, value, applies_to, eligibility, once_per_customer, min_subtotal)
VALUES ('TEST Welcome 10% (new customers)', 'code', 'TESTWELCOME10', 'percent', 10, 'order', 'new_customers', true, 0)
ON CONFLICT DO NOTHING;

INSERT INTO public.discounts (name, method, code, type, value, applies_to, min_subtotal)
VALUES ('TEST 15 EUR off from 100 EUR', 'code', 'TESTFIXED15', 'fixed', 15, 'order', 100)
ON CONFLICT DO NOTHING;

INSERT INTO public.discounts (name, method, code, type, value, applies_to, product_ids)
SELECT 'TEST 20% off the Glow Device', 'code', 'TESTGLOW20', 'percent', 20, 'products',
       ARRAY(SELECT id FROM public.products WHERE sku = 'TEST-DEVICE-A')
ON CONFLICT DO NOTHING;

INSERT INTO public.discounts (name, method, code, type, value, applies_to, exclude_sale_items)
VALUES ('TEST 10% including sale items', 'code', 'TESTSALE10', 'percent', 10, 'order', false)
ON CONFLICT DO NOTHING;

INSERT INTO public.discounts (name, method, code, type, value, applies_to, min_subtotal, combine_product, combine_order)
VALUES ('TEST Free shipping code', 'code', 'TESTSHIP', 'free_shipping', 0, 'order', 0, true, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.discounts (name, method, code, type, value, applies_to, eligibility, segment_tag)
VALUES ('TEST 15% for VIP customers', 'code', 'TESTVIP15', 'percent', 15, 'order', 'tag', 'vip')
ON CONFLICT DO NOTHING;

INSERT INTO public.discounts (name, method, code, type, value, applies_to, customer_email, usage_limit)
VALUES ('TEST Personal 25 EUR for vip@test.invalid', 'code', 'TESTPERSONAL25', 'fixed', 25, 'order', 'vip@test.invalid', 1)
ON CONFLICT DO NOTHING;

INSERT INTO public.discounts (name, method, code, type, value, applies_to, usage_limit)
VALUES ('TEST Limited to 2 uses', 'code', 'TESTLIMIT2', 'percent', 5, 'order', 2)
ON CONFLICT DO NOTHING;

INSERT INTO public.discounts (name, method, code, type, value, applies_to, starts_at, ends_at)
VALUES ('TEST Expired code', 'code', 'TESTEXPIRED', 'percent', 10, 'order', now() - interval '3 days', now() - interval '1 day')
ON CONFLICT DO NOTHING;

INSERT INTO public.discounts (name, method, type, value, applies_to, product_ids, buy_quantity, get_quantity, get_same_as_buy)
SELECT 'TEST Buy 2 gels get 1 free (automatic)', 'automatic', 'buy_x_get_y', 100, 'products',
       ARRAY(SELECT id FROM public.products WHERE sku = 'TEST-GEL'), 2, 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.discounts WHERE name = 'TEST Buy 2 gels get 1 free (automatic)');

-- ---------------------------------------------------------------------------
-- Customers and history (for segments, analytics and the "lapsed" and "high spender" checks)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.seed_paid_order(
  p_email TEXT, p_name TEXT, p_sku TEXT, p_qty INT, p_days INT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_id UUID;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE sku = p_sku;
  IF EXISTS (
    SELECT 1 FROM public.sales_orders
    WHERE customer_email = p_email AND source = 'admin' AND created_at::DATE = (now() - make_interval(days => p_days))::DATE
  ) THEN RETURN; END IF;

  INSERT INTO public.sales_orders (customer_name, customer_email, shipping_address, total, source, payment_method, language)
  VALUES (p_name, p_email,
          '{"address":"Teststrasse 1","city":"Berlin","postal_code":"10115","country":"Germany"}'::JSONB,
          p_qty * v_product.price, 'admin', 'bank_transfer', 'en')
  RETURNING id INTO v_id;
  INSERT INTO public.sales_order_items (sales_order_id, product_id, quantity, unit_price, list_unit_price)
  VALUES (v_id, v_product.id, p_qty, v_product.price, v_product.price);
  UPDATE public.sales_orders SET payment_status = 'paid' WHERE id = v_id;
  UPDATE public.sales_orders
  SET created_at = now() - make_interval(days => p_days), paid_at = now() - make_interval(days => p_days)
  WHERE id = v_id;
END $$;

SELECT pg_temp.seed_paid_order('vip@test.invalid', 'Vera VIP', 'TEST-DEVICE-A', 4, 20);       -- 600 EUR: high spender
SELECT pg_temp.seed_paid_order('lapsed@test.invalid', 'Lars Lapsed', 'TEST-DEVICE-A', 1, 200); -- no purchase in 180 days
SELECT pg_temp.seed_paid_order('repeat@test.invalid', 'Rita Repeat', 'TEST-GEL', 3, 30);       -- repeat customer
SELECT pg_temp.seed_paid_order('repeat@test.invalid', 'Rita Repeat', 'TEST-DEVICE-B', 1, 5);

INSERT INTO public.customers (email, full_name, source) VALUES
  ('newbie@test.invalid', 'Nora Newbie', 'manual'),
  ('guest@test.invalid', 'Gustav Guest', 'manual')
ON CONFLICT (email) DO NOTHING;

UPDATE public.customers SET tags = ARRAY['vip'] WHERE email = 'vip@test.invalid';
UPDATE public.customers
SET marketing_consent = true, marketing_consent_at = now(), marketing_consent_source = 'test'
WHERE email IN ('repeat@test.invalid', 'vip@test.invalid');

-- ---------------------------------------------------------------------------
-- A collection
-- ---------------------------------------------------------------------------
INSERT INTO public.collections (slug, title_de, title_en, title_vi)
VALUES ('test-collection', 'Testkollektion', 'Test collection', 'Bộ sưu tập thử nghiệm')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.collection_products (collection_id, product_id, position)
SELECT c.id, p.id, row_number() OVER (ORDER BY p.sku)
FROM public.collections c JOIN public.products p ON p.sku IN ('TEST-DEVICE-A', 'TEST-GEL')
WHERE c.slug = 'test-collection'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Gift cards (the codes are fixed so the test plan can use them)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.gift_cards WHERE code = 'GC-TEST-TEST-TEST-0001') THEN
    INSERT INTO public.gift_cards (code, initial_amount, balance, note)
    VALUES ('GC-TEST-TEST-TEST-0001', 50, 0, 'TEST card, 50 EUR') RETURNING id INTO v_id;
    PERFORM public.gift_card_move(v_id, 50, 'issued', NULL, NULL, 'TEST seed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gift_cards WHERE code = 'GC-TEST-TEST-TEST-0002') THEN
    INSERT INTO public.gift_cards (code, initial_amount, balance, note)
    VALUES ('GC-TEST-TEST-TEST-0002', 10, 0, 'TEST card, 10 EUR (part payment)') RETURNING id INTO v_id;
    PERFORM public.gift_card_move(v_id, 10, 'issued', NULL, NULL, 'TEST seed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gift_cards WHERE code = 'GC-TEST-TEST-TEST-0003') THEN
    INSERT INTO public.gift_cards (code, initial_amount, balance, note, expires_at)
    VALUES ('GC-TEST-TEST-TEST-0003', 20, 0, 'TEST card, expired', now() - interval '1 day') RETURNING id INTO v_id;
    PERFORM public.gift_card_move(v_id, 20, 'issued', NULL, NULL, 'TEST seed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gift_cards WHERE code = 'GC-TEST-TEST-TEST-0004') THEN
    INSERT INTO public.gift_cards (code, initial_amount, balance, note, status)
    VALUES ('GC-TEST-TEST-TEST-0004', 20, 0, 'TEST card, switched off', 'disabled') RETURNING id INTO v_id;
    PERFORM public.gift_card_move(v_id, 20, 'issued', NULL, NULL, 'TEST seed');
  END IF;
END $$;
