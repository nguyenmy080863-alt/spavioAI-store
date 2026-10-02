-- Checkout writes orders, and a Customers section built on top of them.
--
-- Checkout (logged-in customers and guests) calls place_order(), which re-prices the bag from the
-- products table, so the browser never decides what an order costs. The order starts unpaid. After
-- PayPal confirms, record_order_payment() stores the PayPal reference on the order. It does NOT mark
-- the order as paid: an admin checks the payment in PayPal and presses "Mark as paid" (which
-- reserves the stock). Verifying PayPal on the server to automate this is a follow-up.
--
-- Customers are one row per email address. Rows are created automatically from orders, warranty
-- tickets and account sign-ups (and by hand in the admin panel). Guests never get an account and
-- are never emailed; they only appear here as a customer record.
-- Marketing consent is recorded explicitly (checkbox at checkout and sign-up, or by an admin).
--
-- Safe to run more than once: every statement is idempotent. If you re-run it after 0014, run 0014
-- again afterwards (0014 replaces place_order with the version that stores the language).

-- ---------------------------------------------------------------------------
-- Checkout fields on sales orders
-- ---------------------------------------------------------------------------
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS customer_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'checkout')),
  ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  -- amount_charged: due at checkout (items, or deposits for preorders, plus shipping)
  ADD COLUMN IF NOT EXISTS amount_charged NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount_charged >= 0),
  -- balance_due: preorder balance charged when those items ship
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_reference TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_reported_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sales_orders_email_idx ON public.sales_orders (lower(customer_email));

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('order', 'signup', 'warranty', 'manual')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  marketing_consent_at TIMESTAMPTZ,
  marketing_consent_source TEXT NOT NULL DEFAULT '',
  anonymised_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- If a customers table existed before this migration, bring it up to this shape.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_consent_source TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS anonymised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
-- upsert_customer relies on one row per email.
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique_idx ON public.customers (email);
CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_unique_idx ON public.customers (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_tags_idx ON public.customers USING GIN (tags);

DROP TRIGGER IF EXISTS customers_touch_updated_at ON public.customers;
CREATE TRIGGER customers_touch_updated_at BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Internal helper: create or update a customer by email. Never lowers an existing consent.
CREATE OR REPLACE FUNCTION public.upsert_customer(
  p_email TEXT,
  p_name TEXT,
  p_phone TEXT,
  p_user_id UUID,
  p_source TEXT,
  p_consent BOOLEAN,
  p_consent_source TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_id UUID;
BEGIN
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.customers (
    email, full_name, phone, user_id, source,
    marketing_consent, marketing_consent_at, marketing_consent_source
  ) VALUES (
    v_email, trim(COALESCE(p_name, '')), trim(COALESCE(p_phone, '')), p_user_id, p_source,
    COALESCE(p_consent, false), CASE WHEN p_consent THEN now() END,
    CASE WHEN p_consent THEN COALESCE(p_consent_source, '') ELSE '' END
  )
  ON CONFLICT (email) DO UPDATE SET
    full_name = CASE WHEN customers.full_name = '' THEN EXCLUDED.full_name ELSE customers.full_name END,
    phone = CASE WHEN customers.phone = '' THEN EXCLUDED.phone ELSE customers.phone END,
    user_id = COALESCE(customers.user_id, EXCLUDED.user_id),
    marketing_consent_at = CASE
      WHEN NOT customers.marketing_consent AND EXCLUDED.marketing_consent THEN now()
      ELSE customers.marketing_consent_at END,
    marketing_consent_source = CASE
      WHEN NOT customers.marketing_consent AND EXCLUDED.marketing_consent THEN EXCLUDED.marketing_consent_source
      ELSE customers.marketing_consent_source END,
    marketing_consent = customers.marketing_consent OR EXCLUDED.marketing_consent
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_customer(TEXT, TEXT, TEXT, UUID, TEXT, BOOLEAN, TEXT) FROM public, anon, authenticated;

-- Every order, warranty ticket and sign-up keeps the customer list current.
CREATE OR REPLACE FUNCTION public.customer_from_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID;
BEGIN
  -- Link the account only when the order email is the account's own email.
  SELECT id INTO v_user FROM auth.users
  WHERE id = NEW.customer_id AND lower(email) = lower(trim(NEW.customer_email));
  PERFORM public.upsert_customer(
    NEW.customer_email, NEW.customer_name, NEW.customer_phone, v_user, 'order', false, ''
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sales_orders_customer ON public.sales_orders;
CREATE TRIGGER sales_orders_customer AFTER INSERT ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.customer_from_order();

CREATE OR REPLACE FUNCTION public.customer_from_ticket()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID;
BEGIN
  SELECT id INTO v_user FROM auth.users
  WHERE id = NEW.customer_id AND lower(email) = lower(trim(NEW.customer_email));
  PERFORM public.upsert_customer(NEW.customer_email, NEW.customer_name, '', v_user, 'warranty', false, '');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS warranty_tickets_customer ON public.warranty_tickets;
CREATE TRIGGER warranty_tickets_customer AFTER INSERT ON public.warranty_tickets
FOR EACH ROW EXECUTE FUNCTION public.customer_from_ticket();

-- Sign-up: the form passes marketing_consent in the user metadata. A customer problem must
-- never block sign-up, hence the exception block.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;

  BEGIN
    PERFORM public.upsert_customer(
      NEW.email,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
      '',
      NEW.id,
      'signup',
      COALESCE((NEW.raw_user_meta_data ->> 'marketing_consent')::boolean, false),
      'signup'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- Backfill from what already exists.
INSERT INTO public.customers (email, full_name, phone, source)
SELECT lower(trim(customer_email)), COALESCE(max(NULLIF(customer_name, '')), ''), '', 'order'
FROM public.sales_orders
WHERE position('@' IN customer_email) > 0
GROUP BY lower(trim(customer_email))
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.customers (email, full_name, phone, source)
SELECT lower(trim(customer_email)), COALESCE(max(NULLIF(customer_name, '')), ''), '', 'warranty'
FROM public.warranty_tickets
WHERE position('@' IN customer_email) > 0
GROUP BY lower(trim(customer_email))
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.customers (email, full_name, phone, source, user_id)
SELECT lower(trim(email)), COALESCE(full_name, ''), '', 'signup', id
FROM public.profiles
WHERE email IS NOT NULL AND position('@' IN email) > 0
ON CONFLICT (email) DO NOTHING;

UPDATE public.customers c SET user_id = p.id
FROM public.profiles p
WHERE c.user_id IS NULL AND lower(trim(p.email)) = c.email
  AND NOT EXISTS (SELECT 1 FROM public.customers other WHERE other.user_id = p.id);

-- ---------------------------------------------------------------------------
-- Customer statistics (segments are filters on this view)
-- ---------------------------------------------------------------------------
-- A "purchase" is a paid order that was not cancelled. total includes shipping.
CREATE OR REPLACE VIEW public.customer_stats WITH (security_invoker = true) AS
SELECT
  c.id AS customer_id,
  COUNT(o.id) AS orders_count,
  COUNT(o.id) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled') AS purchases_count,
  COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'), 0) AS total_spent,
  MAX(COALESCE(o.paid_at, o.created_at))
    FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled') AS last_purchase_at,
  (SELECT COUNT(*) FROM public.warranty_tickets t
    WHERE lower(t.customer_email) = c.email AND t.status NOT IN ('resolved', 'closed')) AS open_tickets
FROM public.customers c
LEFT JOIN public.sales_orders o ON lower(o.customer_email) = c.email
GROUP BY c.id;

-- ---------------------------------------------------------------------------
-- Checkout: place an order (guests and signed-in customers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_order(
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_address JSONB,
  p_items JSONB,
  p_shipping_cost NUMERIC,
  p_payment_method TEXT,
  p_marketing_consent BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_name TEXT := trim(COALESCE(p_name, ''));
  v_ship NUMERIC := round(COALESCE(p_shipping_cost, 0), 2);
  v_order public.sales_orders%ROWTYPE;
  v_line RECORD;
  v_product public.products%ROWTYPE;
  v_unit NUMERIC;
  v_due_now NUMERIC;
  v_items_total NUMERIC := 0;
  v_items_now NUMERIC := 0;
  v_user UUID;
BEGIN
  IF v_name = '' OR char_length(v_name) > 160 THEN RAISE EXCEPTION 'Enter your name'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 255 THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;
  IF p_address IS NULL OR jsonb_typeof(p_address) <> 'object'
     OR trim(COALESCE(p_address ->> 'address', '')) = ''
     OR trim(COALESCE(p_address ->> 'city', '')) = ''
     OR trim(COALESCE(p_address ->> 'postal_code', '')) = '' THEN
    RAISE EXCEPTION 'Enter your full shipping address';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'Your bag is empty';
  END IF;
  IF v_ship < 0 OR v_ship > 100 THEN RAISE EXCEPTION 'Invalid shipping cost'; END IF;

  -- Light spam guard: at most 5 unpaid checkout orders per email per hour.
  IF (SELECT count(*) FROM public.sales_orders
      WHERE source = 'checkout' AND payment_status = 'unpaid'
        AND lower(customer_email) = v_email AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many open orders. Please complete or wait before trying again.';
  END IF;

  INSERT INTO public.sales_orders (
    customer_id, customer_name, customer_email, customer_phone, shipping_address,
    shipping_cost, payment_method, source
  ) VALUES (
    auth.uid(), v_name, v_email, left(trim(COALESCE(p_phone, '')), 40),
    jsonb_build_object(
      'address', left(trim(p_address ->> 'address'), 200),
      'city', left(trim(p_address ->> 'city'), 100),
      'postal_code', left(trim(p_address ->> 'postal_code'), 20),
      'country', left(trim(COALESCE(p_address ->> 'country', '')), 80)
    ),
    v_ship, left(trim(COALESCE(p_payment_method, '')), 20), 'checkout'
  ) RETURNING * INTO v_order;

  FOR v_line IN
    SELECT x.slug, sum(x.quantity)::INT AS quantity
    FROM jsonb_to_recordset(p_items) AS x(slug TEXT, quantity INT)
    GROUP BY x.slug
  LOOP
    IF v_line.slug IS NULL OR v_line.quantity IS NULL OR v_line.quantity < 1 OR v_line.quantity > 20 THEN
      RAISE EXCEPTION 'Invalid quantity in your bag';
    END IF;

    SELECT * INTO v_product FROM public.products
    WHERE slug = v_line.slug AND status = 'published' AND archived_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A product in your bag is no longer available';
    END IF;

    v_unit := COALESCE(v_product.sale_price, v_product.price);

    IF v_product.preorder_enabled THEN
      v_due_now := round(least(greatest(
        CASE WHEN v_product.preorder_deposit_type = 'percent'
             THEN v_unit * v_product.preorder_deposit_value / 100
             ELSE v_product.preorder_deposit_value END, 0), v_unit), 2);
    ELSE
      IF v_line.quantity > v_product.stock THEN
        RAISE EXCEPTION 'Not enough stock for %', v_product.name;
      END IF;
      v_due_now := v_unit;
    END IF;

    INSERT INTO public.sales_order_items (sales_order_id, product_id, quantity, unit_price)
    VALUES (v_order.id, v_product.id, v_line.quantity, v_unit);

    v_items_total := v_items_total + v_unit * v_line.quantity;
    v_items_now := v_items_now + v_due_now * v_line.quantity;
  END LOOP;

  UPDATE public.sales_orders
  SET total = v_items_total + v_ship,
      amount_charged = v_items_now + v_ship,
      balance_due = v_items_total - v_items_now
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- Consent is only ever raised here, by an explicit checkbox.
  IF COALESCE(p_marketing_consent, false) THEN
    SELECT id INTO v_user FROM auth.users WHERE id = auth.uid() AND lower(email) = v_email;
    PERFORM public.upsert_customer(v_email, v_name, p_phone, v_user, 'order', true, 'checkout');
  END IF;

  RETURN jsonb_build_object(
    'order_number', v_order.order_number,
    'total', v_order.total,
    'amount_charged', v_order.amount_charged,
    'balance_due', v_order.balance_due
  );
END;
$$;

-- Stores the payment reference reported by the browser. The order stays unpaid until an admin
-- has checked the payment and marked it as paid.
CREATE OR REPLACE FUNCTION public.record_order_payment(p_order_number TEXT, p_email TEXT, p_reference TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sales_orders
  SET payment_reference = left(trim(COALESCE(p_reference, '')), 120),
      payment_reported_at = now()
  WHERE upper(order_number) = upper(trim(COALESCE(p_order_number, '')))
    AND lower(customer_email) = lower(trim(COALESCE(p_email, '')))
    AND source = 'checkout' AND payment_status = 'unpaid' AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(TEXT, TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT, BOOLEAN) FROM public;
REVOKE ALL ON FUNCTION public.record_order_payment(TEXT, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.place_order(TEXT, TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_payment(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Customers: anonymise (GDPR erasure) and access
-- ---------------------------------------------------------------------------
-- Orders are kept for bookkeeping; the customer record and the contact details on warranty
-- tickets are wiped.
CREATE OR REPLACE FUNCTION public.anonymise_customer(p_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can anonymise customers';
  END IF;

  SELECT email INTO v_email FROM public.customers WHERE id = p_customer_id AND anonymised_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;

  UPDATE public.warranty_tickets
  SET customer_name = 'Anonymised', customer_email = 'anonymised-' || id || '@anonymised.invalid', customer_id = NULL
  WHERE lower(customer_email) = v_email;

  UPDATE public.customers
  SET email = 'anonymised-' || id || '@anonymised.invalid', full_name = '', phone = '', notes = '',
      tags = '{}', user_id = NULL, marketing_consent = false, marketing_consent_at = NULL,
      marketing_consent_source = '', anonymised_at = now()
  WHERE id = p_customer_id;
END;
$$;
REVOKE ALL ON FUNCTION public.anonymise_customer(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.anonymise_customer(UUID) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT DELETE ON public.customers TO authenticated;
GRANT SELECT ON public.customer_stats TO authenticated;
GRANT ALL ON public.customers TO service_role;
GRANT SELECT ON public.customer_stats TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read customers" ON public.customers;
CREATE POLICY "Staff read customers" ON public.customers
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff add customers" ON public.customers;
CREATE POLICY "Staff add customers" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff update customers" ON public.customers;
CREATE POLICY "Staff update customers" ON public.customers
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Admins delete customers" ON public.customers;
CREATE POLICY "Admins delete customers" ON public.customers
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
