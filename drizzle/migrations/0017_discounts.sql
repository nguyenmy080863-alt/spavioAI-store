-- Discounts (phase 1): discount codes and automatic discounts.
--
-- Methods     code       the customer types a code (or follows a share link /discount/CODE)
--             automatic  applies by itself when the bag meets the conditions
-- Types       percent | fixed (amount off the order, chosen products, or chosen categories)
--             free_shipping
--
-- All pricing happens on the server, in price_cart(). The checkout page only shows what
-- preview_cart_discounts() returns, and place_order() uses the very same function, so the amount a
-- customer is shown is the amount the order is created with.
--
-- Combination rule (phase 1): at most ONE amount-off discount per order (the one that saves the
-- customer the most; on a tie a typed code beats an automatic discount), plus free shipping on top.
--
-- Always excluded: preorder items (the customer only pays a deposit today). Optionally excluded per
-- discount: items already on sale (exclude_sale_items, on by default).
--
-- order_items.unit_price is now the price AFTER discount, so refunds, exchanges and customer totals
-- keep working unchanged; the list price and the discount are stored next to it for display.
--
-- Safe to run more than once. Needs 0014 to 0016.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('code', 'automatic')),
  code TEXT,
  type TEXT NOT NULL CHECK (type IN ('percent', 'fixed', 'free_shipping')),
  value NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  applies_to TEXT NOT NULL DEFAULT 'order' CHECK (applies_to IN ('order', 'products', 'categories')),
  product_ids UUID[] NOT NULL DEFAULT '{}',
  categories TEXT[] NOT NULL DEFAULT '{}',
  min_subtotal NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_subtotal >= 0),
  min_quantity INT NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  exclude_sale_items BOOLEAN NOT NULL DEFAULT true,
  eligibility TEXT NOT NULL DEFAULT 'all' CHECK (eligibility IN ('all', 'new_customers')),
  usage_limit INT CHECK (usage_limit IS NULL OR usage_limit > 0),
  once_per_customer BOOLEAN NOT NULL DEFAULT false,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((method = 'code' AND code IS NOT NULL AND code <> '') OR (method = 'automatic' AND code IS NULL)),
  CHECK (type = 'free_shipping' OR value > 0),
  CHECK (type <> 'percent' OR value <= 100),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS discounts_code_unique_idx ON public.discounts (lower(code)) WHERE code IS NOT NULL;

DROP TRIGGER IF EXISTS discounts_touch_updated_at ON public.discounts;
CREATE TRIGGER discounts_touch_updated_at BEFORE UPDATE ON public.discounts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- One row per discount used on an order (an order can have an amount-off and a free-shipping row).
CREATE TABLE IF NOT EXISTS public.discount_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id UUID NOT NULL REFERENCES public.discounts(id) ON DELETE RESTRICT,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL DEFAULT '',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (discount_id, sales_order_id)
);
CREATE INDEX IF NOT EXISTS discount_redemptions_email_idx ON public.discount_redemptions (discount_id, lower(customer_email));

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS discount_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_discount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS list_unit_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Pricing helpers
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cart_line' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.cart_line AS (
      product_id UUID,
      slug TEXT,
      name TEXT,
      category TEXT,
      quantity INT,
      unit_price NUMERIC,
      on_sale BOOLEAN,
      preorder BOOLEAN,
      deposit NUMERIC,
      discount NUMERIC
    );
  END IF;
END $$;

-- Does a discount apply to this bag line? (Preorder items never do.)
CREATE OR REPLACE FUNCTION public.cart_line_eligible(l public.cart_line, d public.discounts)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT NOT l.preorder
     AND (NOT d.exclude_sale_items OR NOT l.on_sale)
     AND (
       d.applies_to = 'order'
       OR (d.applies_to = 'products' AND l.product_id = ANY (d.product_ids))
       OR (d.applies_to = 'categories' AND l.category = ANY (d.categories))
     )
$$;

-- Number of times a discount counts as used. Cancelled orders and unpaid orders older than two
-- hours (abandoned PayPal windows) do not count, so they cannot use up a limited code.
CREATE OR REPLACE FUNCTION public.discount_uses(p_discount_id UUID, p_email TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::INT
  FROM public.discount_redemptions r
  JOIN public.sales_orders o ON o.id = r.sales_order_id
  WHERE r.discount_id = p_discount_id
    AND o.status <> 'cancelled'
    AND (o.payment_status <> 'unpaid' OR o.created_at > now() - interval '2 hours')
    AND (p_email IS NULL OR lower(r.customer_email) = lower(p_email))
$$;
REVOKE ALL ON FUNCTION public.discount_uses(UUID, TEXT) FROM public, anon, authenticated;

-- Why a discount cannot be used by this customer, or NULL. Email-based rules are skipped while the
-- email is not known yet (checkout preview before the customer typed it); place_order always has it.
CREATE OR REPLACE FUNCTION public.discount_blocked_reason(d public.discounts, p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT d.active THEN RETURN 'inactive'; END IF;
  IF now() < d.starts_at THEN RETURN 'not_started'; END IF;
  IF d.ends_at IS NOT NULL AND now() > d.ends_at THEN RETURN 'expired'; END IF;
  IF d.usage_limit IS NOT NULL AND public.discount_uses(d.id) >= d.usage_limit THEN RETURN 'usage_limit'; END IF;
  IF p_email <> '' THEN
    IF d.once_per_customer AND public.discount_uses(d.id, p_email) > 0 THEN RETURN 'already_used'; END IF;
    IF d.eligibility = 'new_customers' AND EXISTS (
      SELECT 1 FROM public.sales_orders o
      WHERE lower(o.customer_email) = lower(p_email) AND o.payment_status = 'paid' AND o.status <> 'cancelled'
    ) THEN RETURN 'new_customers_only'; END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.discount_blocked_reason(public.discounts, TEXT) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- price_cart: the one place that prices a bag
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.price_cart(
  p_items JSONB,
  p_code TEXT,
  p_email TEXT,
  p_shipping_cost NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_code TEXT := lower(trim(COALESCE(p_code, '')));
  v_ship NUMERIC := round(COALESCE(p_shipping_cost, 0), 2);
  v_lines public.cart_line[] := '{}';
  v_line public.cart_line;
  v_row RECORD;
  v_product public.products%ROWTYPE;
  v_d public.discounts%ROWTYPE;
  v_unit NUMERIC;
  v_on_sale BOOLEAN;
  v_deposit NUMERIC;
  v_subtotal NUMERIC := 0;
  v_elig_sub NUMERIC;
  v_elig_qty INT;
  v_saving NUMERIC;
  v_best_saving NUMERIC := 0;
  v_best public.discounts%ROWTYPE;
  v_best_is_code BOOLEAN := false;
  v_has_best BOOLEAN := false;
  v_is_code BOOLEAN;
  v_blocked TEXT;
  v_status TEXT := NULL;
  v_min_needed NUMERIC := NULL;
  v_code_exists BOOLEAN := false;
  v_off_total NUMERIC := 0;
  v_alloc NUMERIC;
  v_allocated NUMERIC;
  v_last INT;
  v_target NUMERIC;
  v_value NUMERIC;
  i INT;
  v_free public.discounts%ROWTYPE;
  v_has_free BOOLEAN := false;
  v_items_after NUMERIC;
  v_total_qty INT := 0;
  v_ship_after NUMERIC;
  v_items_total NUMERIC := 0;
  v_items_now NUMERIC := 0;
  v_out_lines JSONB := '[]'::jsonb;
  v_line_total NUMERIC;
  v_due NUMERIC;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'Your bag is empty';
  END IF;
  IF v_ship < 0 OR v_ship > 100 THEN RAISE EXCEPTION 'Invalid shipping cost'; END IF;

  -- 1. The bag, priced from the products table.
  FOR v_row IN
    SELECT x.slug, sum(x.quantity)::INT AS quantity
    FROM jsonb_to_recordset(p_items) AS x(slug TEXT, quantity INT)
    GROUP BY x.slug ORDER BY x.slug
  LOOP
    IF v_row.slug IS NULL OR v_row.quantity IS NULL OR v_row.quantity < 1 OR v_row.quantity > 20 THEN
      RAISE EXCEPTION 'Invalid quantity in your bag';
    END IF;
    SELECT * INTO v_product FROM public.products
    WHERE slug = v_row.slug AND status = 'published' AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'A product in your bag is no longer available'; END IF;

    v_on_sale := v_product.sale_price IS NOT NULL AND v_product.sale_price > 0 AND v_product.sale_price < v_product.price;
    v_unit := CASE WHEN v_on_sale THEN v_product.sale_price ELSE v_product.price END;
    v_deposit := NULL;
    IF v_product.preorder_enabled THEN
      v_deposit := round(least(greatest(
        CASE WHEN v_product.preorder_deposit_type = 'percent'
             THEN v_unit * v_product.preorder_deposit_value / 100
             ELSE v_product.preorder_deposit_value END, 0), v_unit), 2);
    END IF;

    v_line := ROW(v_product.id, v_product.slug, v_product.name, v_product.category, v_row.quantity,
                  v_unit, v_on_sale, v_product.preorder_enabled, v_deposit, 0)::public.cart_line;
    v_lines := v_lines || v_line;
    v_subtotal := v_subtotal + v_unit * v_row.quantity;
    v_total_qty := v_total_qty + v_row.quantity;
  END LOOP;

  -- 2. The best amount-off discount (automatic ones, plus the typed code if it is one).
  FOR v_d IN
    SELECT * FROM public.discounts
    WHERE type IN ('percent', 'fixed')
      AND (method = 'automatic' OR (method = 'code' AND v_code <> '' AND lower(code) = v_code))
    ORDER BY method DESC, created_at
  LOOP
    v_is_code := v_d.method = 'code';
    IF v_is_code THEN v_code_exists := true; END IF;

    v_blocked := public.discount_blocked_reason(v_d, v_email);
    IF v_blocked IS NOT NULL THEN
      IF v_is_code THEN v_status := v_blocked; END IF;
      CONTINUE;
    END IF;

    v_elig_sub := 0; v_elig_qty := 0;
    FOREACH v_line IN ARRAY v_lines LOOP
      IF public.cart_line_eligible(v_line, v_d) THEN
        v_elig_sub := v_elig_sub + v_line.unit_price * v_line.quantity;
        v_elig_qty := v_elig_qty + v_line.quantity;
      END IF;
    END LOOP;

    IF v_elig_qty = 0 THEN
      IF v_is_code THEN v_status := 'no_eligible_items'; END IF;
      CONTINUE;
    END IF;
    IF v_elig_sub < v_d.min_subtotal THEN
      IF v_is_code THEN v_status := 'min_subtotal'; v_min_needed := v_d.min_subtotal; END IF;
      CONTINUE;
    END IF;
    IF v_elig_qty < v_d.min_quantity THEN
      IF v_is_code THEN v_status := 'min_quantity'; v_min_needed := v_d.min_quantity; END IF;
      CONTINUE;
    END IF;

    IF v_d.type = 'percent' THEN
      v_saving := 0;
      FOREACH v_line IN ARRAY v_lines LOOP
        IF public.cart_line_eligible(v_line, v_d) THEN
          v_saving := v_saving + round(v_line.unit_price * v_d.value / 100, 2) * v_line.quantity;
        END IF;
      END LOOP;
    ELSE
      v_saving := least(v_d.value, v_elig_sub);
    END IF;

    IF v_saving > v_best_saving OR (v_saving = v_best_saving AND v_saving > 0 AND v_is_code AND NOT v_best_is_code) THEN
      -- An automatic discount that saves more replaces the typed code's discount.
      IF v_has_best AND v_best_is_code AND NOT v_is_code THEN v_status := 'better_discount_applied'; END IF;
      v_best := v_d; v_best_saving := v_saving; v_best_is_code := v_is_code; v_has_best := true;
    ELSIF v_is_code THEN
      v_status := 'better_discount_applied';
    END IF;
  END LOOP;

  -- 3. Hand the chosen discount out to the bag lines.
  IF v_has_best THEN
    IF v_best_is_code THEN v_status := 'applied'; END IF;
    v_last := 0;
    FOR i IN 1 .. array_length(v_lines, 1) LOOP
      IF public.cart_line_eligible(v_lines[i], v_best) THEN v_last := i; END IF;
    END LOOP;
    v_allocated := 0;
    FOR i IN 1 .. array_length(v_lines, 1) LOOP
      v_line := v_lines[i];
      IF public.cart_line_eligible(v_line, v_best) THEN
        IF v_best.type = 'percent' THEN
          v_alloc := round(v_line.unit_price * v_best.value / 100, 2) * v_line.quantity;
        ELSIF i = v_last THEN
          v_alloc := v_best_saving - v_allocated;
        ELSE
          SELECT sum(l.unit_price * l.quantity) INTO v_value
          FROM unnest(v_lines) AS l WHERE public.cart_line_eligible(l, v_best);
          v_alloc := round(v_best_saving * (v_line.unit_price * v_line.quantity) / v_value, 2);
        END IF;
        v_line.discount := v_alloc;
        v_lines[i] := v_line;
        v_allocated := v_allocated + v_alloc;
      END IF;
    END LOOP;
    v_off_total := v_allocated;
  END IF;

  -- 4. Free shipping (combines with the amount-off discount).
  v_items_after := v_subtotal - v_off_total;
  IF v_ship > 0 THEN
    FOR v_d IN
      SELECT * FROM public.discounts
      WHERE type = 'free_shipping'
        AND (method = 'automatic' OR (method = 'code' AND v_code <> '' AND lower(code) = v_code))
      ORDER BY method DESC, created_at
    LOOP
      v_is_code := v_d.method = 'code';
      IF v_is_code THEN v_code_exists := true; END IF;

      v_blocked := public.discount_blocked_reason(v_d, v_email);
      IF v_blocked IS NOT NULL THEN
        IF v_is_code THEN v_status := v_blocked; END IF;
        CONTINUE;
      END IF;
      IF v_items_after < v_d.min_subtotal THEN
        IF v_is_code THEN v_status := 'min_subtotal'; v_min_needed := v_d.min_subtotal; END IF;
        CONTINUE;
      END IF;
      IF v_total_qty < v_d.min_quantity THEN
        IF v_is_code THEN v_status := 'min_quantity'; v_min_needed := v_d.min_quantity; END IF;
        CONTINUE;
      END IF;
      v_free := v_d; v_has_free := true;
      IF v_is_code THEN v_status := 'applied'; END IF;
      EXIT;
    END LOOP;
  END IF;

  IF v_code <> '' AND NOT v_code_exists THEN v_status := 'invalid'; END IF;
  IF v_code <> '' AND v_status IS NULL THEN v_status := 'not_applicable'; END IF;

  v_ship_after := CASE WHEN v_has_free THEN 0 ELSE v_ship END;

  -- 5. Totals and the lines as JSON.
  FOREACH v_line IN ARRAY v_lines LOOP
    v_line_total := v_line.unit_price * v_line.quantity - v_line.discount;
    v_due := CASE WHEN v_line.preorder THEN v_line.deposit * v_line.quantity ELSE v_line_total END;
    v_items_total := v_items_total + v_line_total;
    v_items_now := v_items_now + v_due;
    v_out_lines := v_out_lines || jsonb_build_object(
      'product_id', v_line.product_id, 'slug', v_line.slug, 'name', v_line.name,
      'quantity', v_line.quantity, 'list_unit_price', v_line.unit_price,
      'discount', v_line.discount, 'line_total', v_line_total, 'due_now', v_due,
      'preorder', v_line.preorder
    );
  END LOOP;

  RETURN jsonb_build_object(
    'lines', v_out_lines,
    'subtotal', v_subtotal,
    'discount_total', v_off_total,
    'amount_off', CASE WHEN v_has_best THEN jsonb_build_object(
      'id', v_best.id, 'name', v_best.name, 'code', v_best.code, 'amount', v_off_total) END,
    'free_shipping', CASE WHEN v_has_free THEN jsonb_build_object(
      'id', v_free.id, 'name', v_free.name, 'code', v_free.code, 'amount', v_ship) END,
    'shipping_cost_original', v_ship,
    'shipping_cost', v_ship_after,
    'items_total', v_items_total,
    'items_due_now', v_items_now,
    'total', v_items_total + v_ship_after,
    'amount_charged', v_items_now + v_ship_after,
    'balance_due', v_items_total - v_items_now,
    'code_status', v_status,
    'code_min', v_min_needed
  );
END;
$$;
REVOKE ALL ON FUNCTION public.price_cart(JSONB, TEXT, TEXT, NUMERIC) FROM public, anon, authenticated;

-- What the checkout page shows (no side effects).
CREATE OR REPLACE FUNCTION public.preview_cart_discounts(
  p_items JSONB, p_code TEXT, p_email TEXT, p_shipping_cost NUMERIC
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.price_cart(p_items, p_code, p_email, p_shipping_cost)
$$;
REVOKE ALL ON FUNCTION public.preview_cart_discounts(JSONB, TEXT, TEXT, NUMERIC) FROM public;
GRANT EXECUTE ON FUNCTION public.preview_cart_discounts(JSONB, TEXT, TEXT, NUMERIC) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- place_order: now priced by price_cart (replaces the 0014 version)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.place_order(TEXT, TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.place_order(
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_address JSONB,
  p_items JSONB,
  p_shipping_cost NUMERIC,
  p_payment_method TEXT,
  p_marketing_consent BOOLEAN,
  p_language TEXT DEFAULT 'de',
  p_discount_code TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_name TEXT := trim(COALESCE(p_name, ''));
  v_ship NUMERIC := round(COALESCE(p_shipping_cost, 0), 2);
  v_language TEXT := CASE WHEN p_language IN ('de', 'en', 'vi') THEN p_language ELSE 'de' END;
  v_code TEXT := trim(COALESCE(p_discount_code, ''));
  v_priced JSONB;
  v_order public.sales_orders%ROWTYPE;
  v_line JSONB;
  v_product public.products%ROWTYPE;
  v_quantity INT;
  v_list NUMERIC;
  v_discount NUMERIC;
  v_codes TEXT[] := '{}';
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
  IF v_ship < 0 OR v_ship > 100 THEN RAISE EXCEPTION 'Invalid shipping cost'; END IF;

  -- Light spam guard: at most 5 unpaid checkout orders per email per hour.
  IF (SELECT count(*) FROM public.sales_orders
      WHERE source = 'checkout' AND payment_status = 'unpaid'
        AND lower(customer_email) = v_email AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many open orders. Please complete or wait before trying again.';
  END IF;

  -- Serialise checkouts that could use the same discount, so a usage limit cannot be overrun.
  PERFORM 1 FROM public.discounts
  WHERE active AND (method = 'automatic' OR (v_code <> '' AND lower(code) = lower(v_code)))
  FOR UPDATE;

  v_priced := public.price_cart(p_items, v_code, v_email, v_ship);

  -- A code the customer typed must still work; otherwise stop instead of charging a different price.
  IF v_code <> '' AND COALESCE(v_priced ->> 'code_status', '') NOT IN ('applied', 'better_discount_applied') THEN
    RAISE EXCEPTION 'discount:%', COALESCE(v_priced ->> 'code_status', 'invalid');
  END IF;

  INSERT INTO public.sales_orders (
    customer_id, customer_name, customer_email, customer_phone, shipping_address,
    shipping_cost, payment_method, source, language
  ) VALUES (
    auth.uid(), v_name, v_email, left(trim(COALESCE(p_phone, '')), 40),
    jsonb_build_object(
      'address', left(trim(p_address ->> 'address'), 200),
      'city', left(trim(p_address ->> 'city'), 100),
      'postal_code', left(trim(p_address ->> 'postal_code'), 20),
      'country', left(trim(COALESCE(p_address ->> 'country', '')), 80)
    ),
    (v_priced ->> 'shipping_cost')::NUMERIC, left(trim(COALESCE(p_payment_method, '')), 20), 'checkout', v_language
  ) RETURNING * INTO v_order;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_priced -> 'lines') LOOP
    v_quantity := (v_line ->> 'quantity')::INT;
    SELECT * INTO v_product FROM public.products WHERE id = (v_line ->> 'product_id')::UUID;
    IF NOT (v_line ->> 'preorder')::BOOLEAN AND v_quantity > v_product.stock THEN
      RAISE EXCEPTION 'Not enough stock for %', v_product.name;
    END IF;

    v_list := (v_line ->> 'list_unit_price')::NUMERIC;
    v_discount := (v_line ->> 'discount')::NUMERIC;
    -- unit_price is what the customer pays per unit, so refunds give back exactly that.
    INSERT INTO public.sales_order_items (
      sales_order_id, product_id, quantity, unit_price, list_unit_price, discount_amount
    ) VALUES (
      v_order.id, v_product.id, v_quantity,
      round(((v_line ->> 'line_total')::NUMERIC) / v_quantity, 2), v_list, v_discount
    );
  END LOOP;

  IF v_priced -> 'amount_off' IS NOT NULL AND jsonb_typeof(v_priced -> 'amount_off') = 'object' THEN
    INSERT INTO public.discount_redemptions (discount_id, sales_order_id, customer_email, amount)
    VALUES ((v_priced -> 'amount_off' ->> 'id')::UUID, v_order.id, v_email, (v_priced -> 'amount_off' ->> 'amount')::NUMERIC);
    v_codes := v_codes || COALESCE(NULLIF(v_priced -> 'amount_off' ->> 'code', ''), v_priced -> 'amount_off' ->> 'name');
  END IF;
  IF v_priced -> 'free_shipping' IS NOT NULL AND jsonb_typeof(v_priced -> 'free_shipping') = 'object' THEN
    INSERT INTO public.discount_redemptions (discount_id, sales_order_id, customer_email, amount)
    VALUES ((v_priced -> 'free_shipping' ->> 'id')::UUID, v_order.id, v_email, (v_priced -> 'free_shipping' ->> 'amount')::NUMERIC);
    v_codes := v_codes || COALESCE(NULLIF(v_priced -> 'free_shipping' ->> 'code', ''), v_priced -> 'free_shipping' ->> 'name');
  END IF;

  UPDATE public.sales_orders
  SET total = (v_priced ->> 'total')::NUMERIC,
      amount_charged = (v_priced ->> 'amount_charged')::NUMERIC,
      balance_due = (v_priced ->> 'balance_due')::NUMERIC,
      discount_code = array_to_string(v_codes, ', '),
      discount_amount = (v_priced ->> 'discount_total')::NUMERIC,
      shipping_discount = CASE WHEN jsonb_typeof(v_priced -> 'free_shipping') = 'object'
                               THEN (v_priced ->> 'shipping_cost_original')::NUMERIC ELSE 0 END
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

REVOKE ALL ON FUNCTION public.place_order(TEXT, TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT, BOOLEAN, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.place_order(TEXT, TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT, BOOLEAN, TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Order pages show the discount (replaces the 0015 version)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_detail_json(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'payment_status', o.payment_status,
    'payment_reported', o.payment_reported_at IS NOT NULL,
    'total', o.total,
    'shipping_cost', o.shipping_cost,
    'amount_charged', o.amount_charged,
    'balance_due', o.balance_due,
    'discount_code', o.discount_code,
    'discount_amount', o.discount_amount,
    'shipping_discount', o.shipping_discount,
    'shipping_address', o.shipping_address,
    'created_at', o.created_at,
    'paid_at', o.paid_at,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', p.name, 'slug', p.slug, 'quantity', i.quantity, 'unit_price', i.unit_price
      ) ORDER BY p.name)
      FROM public.sales_order_items i JOIN public.products p ON p.id = i.product_id
      WHERE i.sales_order_id = o.id
    ), '[]'::jsonb),
    'deliveries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'delivery_number', d.delivery_number, 'status', d.status, 'carrier', d.carrier,
        'tracking_number', d.tracking_number, 'shipped_at', d.shipped_at, 'delivered_at', d.delivered_at
      ) ORDER BY d.created_at)
      FROM public.delivery_orders d
      WHERE d.sales_order_id = o.id AND d.status <> 'cancelled'
    ), '[]'::jsonb),
    'warranty_expires_at', (
      SELECT min(d.delivered_at) + interval '2 years'
      FROM public.delivery_orders d WHERE d.sales_order_id = o.id AND d.status = 'delivered'
    ),
    'can_return', o.payment_status = 'paid' AND o.status <> 'cancelled' AND EXISTS (
      SELECT 1 FROM public.order_returnable_items(o.id) r WHERE r.quantity_returnable > 0 AND r.in_window
    ),
    'return_window_ends_at', (
      SELECT max(r.window_ends_at) FROM public.order_returnable_items(o.id) r WHERE r.delivered_at IS NOT NULL
    ),
    'returns', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'return_number', rr.return_number, 'status', rr.status,
        'refund_amount', rr.refund_amount, 'created_at', rr.created_at
      ) ORDER BY rr.created_at DESC)
      FROM public.return_requests rr WHERE rr.sales_order_id = o.id
    ), '[]'::jsonb)
  )
  FROM public.sales_orders o WHERE o.id = p_order_id
$$;
REVOKE ALL ON FUNCTION public.order_detail_json(UUID) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin access and statistics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.discount_stats WITH (security_invoker = true) AS
SELECT
  d.id AS discount_id,
  COUNT(r.id) FILTER (
    WHERE o.status <> 'cancelled' AND (o.payment_status <> 'unpaid' OR o.created_at > now() - interval '2 hours')
  ) AS uses,
  COALESCE(SUM(r.amount) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'), 0) AS amount_given,
  COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'), 0) AS revenue
FROM public.discounts d
LEFT JOIN public.discount_redemptions r ON r.discount_id = d.id
LEFT JOIN public.sales_orders o ON o.id = r.sales_order_id
GROUP BY d.id;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discounts TO authenticated;
GRANT SELECT ON public.discount_redemptions, public.discount_stats TO authenticated;
GRANT ALL ON public.discounts, public.discount_redemptions TO service_role;
GRANT SELECT ON public.discount_stats TO service_role;

ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_redemptions ENABLE ROW LEVEL SECURITY;

-- Codes are secret: customers never read this table, they only go through the functions above.
DROP POLICY IF EXISTS "Staff read discounts" ON public.discounts;
CREATE POLICY "Staff read discounts" ON public.discounts
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Managers write discounts" ON public.discounts;
CREATE POLICY "Managers write discounts" ON public.discounts
  FOR ALL TO authenticated
  USING (public.can_manage_products(auth.uid())) WITH CHECK (public.can_manage_products(auth.uid()));
DROP POLICY IF EXISTS "Staff read redemptions" ON public.discount_redemptions;
CREATE POLICY "Staff read redemptions" ON public.discount_redemptions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- The free-shipping threshold used to be hard-coded in the checkout page (99 EUR).
-- It is now an automatic discount you can edit or switch off in the admin panel.
-- ---------------------------------------------------------------------------
INSERT INTO public.discounts (name, method, type, value, applies_to, min_subtotal)
SELECT 'Free shipping from 99 EUR', 'automatic', 'free_shipping', 0, 'order', 99
WHERE NOT EXISTS (SELECT 1 FROM public.discounts);
