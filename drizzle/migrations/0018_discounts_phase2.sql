-- Discounts, phase 2: Buy X Get Y, customer-segment eligibility, a combinations matrix and
-- personal codes. Needs 0017. Safe to run more than once.
--
-- BUY X GET Y   buy_quantity units from the "buy" set unlock get_quantity units from the "get" set at
--               value % off (100 = free). The cheapest eligible "get" units are discounted. When the
--               get set is "the same products as the buy set" (buy 2 get 1 free of the same thing) a
--               group is buy_quantity + get_quantity units. Optional cap: get_max_units per order.
--
-- SEGMENTS      eligibility: all | new_customers | returning | high_spenders | lapsed | tag
--               (spent / days / tag come from segment_min_spent, segment_days, segment_tag).
--
-- COMBINATIONS  Every discount belongs to a class: product (chosen products/categories, Buy X Get Y),
--               order (whole-order amount off) or shipping (free shipping). Two discounts of the same
--               class never combine. Two of different classes combine only if BOTH allow the other's
--               class (combine_product / combine_order / combine_shipping). Product-class discounts
--               are applied first, order-class discounts on what is left.
--
-- PERSONAL CODES  customer_email restricts a code to one customer (checked when the order is placed).

-- ---------------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'discounts' AND column_name = 'combine_product'
  ) THEN
    ALTER TABLE public.discounts
      ADD COLUMN combine_product BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN combine_order BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN combine_shipping BOOLEAN NOT NULL DEFAULT true;
    -- Phase 1 let free shipping stack on top of an amount-off discount; keep that behaviour.
    UPDATE public.discounts SET combine_product = true, combine_order = true WHERE type = 'free_shipping';
  END IF;
END $$;

ALTER TABLE public.discounts
  ADD COLUMN IF NOT EXISTS buy_quantity INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS get_quantity INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS get_same_as_buy BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS get_applies_to TEXT NOT NULL DEFAULT 'products',
  ADD COLUMN IF NOT EXISTS get_product_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS get_categories TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS get_max_units INT,
  ADD COLUMN IF NOT EXISTS segment_min_spent NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS segment_days INT NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS segment_tag TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

DO $$
DECLARE c RECORD;
BEGIN
  -- Replace the checks that mention the type or eligibility lists, then add them back widened.
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.discounts'::regclass AND contype = 'c'
      AND (pg_get_constraintdef(oid) LIKE '%free_shipping%'
           OR pg_get_constraintdef(oid) LIKE '%''percent''%'
           OR pg_get_constraintdef(oid) LIKE '%new_customers%'
           OR pg_get_constraintdef(oid) LIKE '%get_applies_to%'
           OR pg_get_constraintdef(oid) LIKE '%buy_quantity%'
           OR pg_get_constraintdef(oid) LIKE '%get_quantity%')
  LOOP
    EXECUTE format('ALTER TABLE public.discounts DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.discounts
    ADD CONSTRAINT discounts_type_check CHECK (type IN ('percent', 'fixed', 'free_shipping', 'buy_x_get_y')),
    ADD CONSTRAINT discounts_value_positive_check CHECK (type = 'free_shipping' OR value > 0),
    ADD CONSTRAINT discounts_percent_max_check CHECK (type NOT IN ('percent', 'buy_x_get_y') OR value <= 100),
    ADD CONSTRAINT discounts_eligibility_check
      CHECK (eligibility IN ('all', 'new_customers', 'returning', 'high_spenders', 'lapsed', 'tag')),
    ADD CONSTRAINT discounts_get_applies_to_check CHECK (get_applies_to IN ('order', 'products', 'categories')),
    ADD CONSTRAINT discounts_bxgy_quantities_check CHECK (buy_quantity >= 1 AND get_quantity >= 1);
END $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discount_class(d public.discounts) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d.type = 'free_shipping' THEN 'shipping'
    WHEN d.type = 'buy_x_get_y' THEN 'product'
    WHEN d.applies_to IN ('products', 'categories') THEN 'product'
    ELSE 'order' END
$$;

-- May two discounts be used on the same order? Same class never; otherwise both must allow it.
CREATE OR REPLACE FUNCTION public.discounts_combine(a public.discounts, b public.discounts) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT public.discount_class(a) <> public.discount_class(b)
    AND CASE public.discount_class(b)
          WHEN 'product' THEN a.combine_product WHEN 'order' THEN a.combine_order ELSE a.combine_shipping END
    AND CASE public.discount_class(a)
          WHEN 'product' THEN b.combine_product WHEN 'order' THEN b.combine_order ELSE b.combine_shipping END
$$;

-- Items a Buy X Get Y discount may reward (never preorders; sale items follow exclude_sale_items).
CREATE OR REPLACE FUNCTION public.cart_line_in_get_set(l public.cart_line, d public.discounts) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT NOT l.preorder
     AND (NOT d.exclude_sale_items OR NOT l.on_sale)
     AND (
       d.get_same_as_buy AND public.cart_line_eligible(l, d)
       OR (NOT d.get_same_as_buy AND (
            d.get_applies_to = 'order'
            OR (d.get_applies_to = 'products' AND l.product_id = ANY (d.get_product_ids))
            OR (d.get_applies_to = 'categories' AND l.category = ANY (d.get_categories))))
     )
$$;

-- Applies one discount to the bag lines (cumulative: it works on what earlier discounts left).
CREATE OR REPLACE FUNCTION public.apply_discount_to_lines(p_lines public.cart_line[], d public.discounts)
RETURNS public.cart_line[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_lines public.cart_line[] := p_lines;
  v_line public.cart_line;
  v_n INT := COALESCE(array_length(p_lines, 1), 0);
  v_extra NUMERIC[];
  v_rem NUMERIC;
  v_total_rem NUMERIC := 0;
  v_target NUMERIC;
  v_allocated NUMERIC := 0;
  v_alloc NUMERIC;
  v_last INT := 0;
  v_units INT := 0;
  v_get_units INT := 0;
  v_rewards INT := 0;
  v_left INT;
  v_take INT;
  i INT;
  r RECORD;
BEGIN
  IF v_n = 0 THEN RETURN v_lines; END IF;
  v_extra := array_fill(0::NUMERIC, ARRAY[v_n]);

  IF d.type = 'percent' THEN
    FOR i IN 1 .. v_n LOOP
      v_line := v_lines[i];
      IF public.cart_line_eligible(v_line, d) THEN
        v_extra[i] := round((v_line.unit_price * v_line.quantity - v_line.discount) * d.value / 100, 2);
      END IF;
    END LOOP;

  ELSIF d.type = 'fixed' THEN
    FOR i IN 1 .. v_n LOOP
      v_line := v_lines[i];
      IF public.cart_line_eligible(v_line, d) THEN
        v_total_rem := v_total_rem + (v_line.unit_price * v_line.quantity - v_line.discount);
        v_last := i;
      END IF;
    END LOOP;
    IF v_last > 0 AND v_total_rem > 0 THEN
      v_target := least(d.value, v_total_rem);
      FOR i IN 1 .. v_n LOOP
        v_line := v_lines[i];
        IF public.cart_line_eligible(v_line, d) THEN
          v_rem := v_line.unit_price * v_line.quantity - v_line.discount;
          v_alloc := CASE WHEN i = v_last THEN v_target - v_allocated
                          ELSE round(v_target * v_rem / v_total_rem, 2) END;
          v_extra[i] := v_alloc;
          v_allocated := v_allocated + v_alloc;
        END IF;
      END LOOP;
    END IF;

  ELSIF d.type = 'buy_x_get_y' THEN
    FOR i IN 1 .. v_n LOOP
      v_line := v_lines[i];
      IF public.cart_line_eligible(v_line, d) THEN v_units := v_units + v_line.quantity; END IF;
      IF public.cart_line_in_get_set(v_line, d) THEN v_get_units := v_get_units + v_line.quantity; END IF;
    END LOOP;
    IF d.get_same_as_buy THEN
      v_rewards := (v_units / (d.buy_quantity + d.get_quantity)) * d.get_quantity;
    ELSE
      v_rewards := least((v_units / d.buy_quantity) * d.get_quantity, v_get_units);
    END IF;
    IF d.get_max_units IS NOT NULL THEN v_rewards := least(v_rewards, d.get_max_units); END IF;

    v_left := v_rewards;
    FOR r IN
      SELECT t.idx, (t.l).quantity AS qty, (t.l).unit_price AS price
      FROM unnest(v_lines) WITH ORDINALITY AS t(l, idx)
      WHERE public.cart_line_in_get_set(t.l, d)
      ORDER BY (t.l).unit_price ASC, t.idx
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := least(r.qty, v_left);
      v_extra[r.idx::INT] := v_take * round(r.price * d.value / 100, 2);
      v_left := v_left - v_take;
    END LOOP;
  END IF;

  FOR i IN 1 .. v_n LOOP
    IF v_extra[i] > 0 THEN
      v_line := v_lines[i];
      -- Never take off more than the line is worth.
      v_line.discount := v_line.discount + least(v_extra[i], v_line.unit_price * v_line.quantity - v_line.discount);
      v_lines[i] := v_line;
    END IF;
  END LOOP;
  RETURN v_lines;
END;
$$;

-- Where a customer stands, for segment discounts. total spent matches the Customers page.
CREATE OR REPLACE FUNCTION public.customer_standing(p_email TEXT) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'purchases', count(*) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'),
    'spent', GREATEST(
      COALESCE(sum(o.total) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'), 0)
      - COALESCE((SELECT sum(r.refund_amount - r.refund_deduction) FROM public.return_requests r
                  WHERE lower(r.customer_email) = lower(p_email) AND r.status = 'refunded'), 0),
      0),
    'last_purchase_at', max(COALESCE(o.paid_at, o.created_at))
      FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'),
    'tags', to_jsonb(COALESCE((SELECT c.tags FROM public.customers c WHERE c.email = lower(p_email)), '{}'::TEXT[]))
  )
  FROM public.sales_orders o WHERE lower(o.customer_email) = lower(p_email)
$$;
REVOKE ALL ON FUNCTION public.customer_standing(TEXT) FROM public, anon, authenticated;

-- Why a discount cannot be used by this customer, or NULL (replaces the 0017 version).
CREATE OR REPLACE FUNCTION public.discount_blocked_reason(d public.discounts, p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stand JSONB;
BEGIN
  IF NOT d.active THEN RETURN 'inactive'; END IF;
  IF now() < d.starts_at THEN RETURN 'not_started'; END IF;
  IF d.ends_at IS NOT NULL AND now() > d.ends_at THEN RETURN 'expired'; END IF;
  IF d.usage_limit IS NOT NULL AND public.discount_uses(d.id) >= d.usage_limit THEN RETURN 'usage_limit'; END IF;

  -- Email-based rules are skipped while the email is unknown (checkout preview before it is typed);
  -- place_order always has it and enforces them.
  IF p_email <> '' THEN
    IF d.customer_email IS NOT NULL AND lower(d.customer_email) <> lower(p_email) THEN RETURN 'wrong_customer'; END IF;
    IF d.once_per_customer AND public.discount_uses(d.id, p_email) > 0 THEN RETURN 'already_used'; END IF;

    IF d.eligibility <> 'all' THEN
      v_stand := public.customer_standing(p_email);
      IF d.eligibility = 'new_customers' AND (v_stand ->> 'purchases')::INT > 0 THEN
        RETURN 'new_customers_only';
      ELSIF d.eligibility = 'returning' AND (v_stand ->> 'purchases')::INT = 0 THEN
        RETURN 'not_eligible';
      ELSIF d.eligibility = 'high_spenders' AND (v_stand ->> 'spent')::NUMERIC < d.segment_min_spent THEN
        RETURN 'not_eligible';
      ELSIF d.eligibility = 'lapsed' AND (
        (v_stand ->> 'purchases')::INT = 0
        OR (v_stand ->> 'last_purchase_at')::TIMESTAMPTZ > now() - make_interval(days => d.segment_days)
      ) THEN
        RETURN 'not_eligible';
      ELSIF d.eligibility = 'tag' AND NOT ((v_stand -> 'tags') @> to_jsonb(lower(d.segment_tag))) THEN
        RETURN 'not_eligible';
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.discount_blocked_reason(public.discounts, TEXT) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- price_cart (replaces the 0017 version): combinations matrix and Buy X Get Y
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
  v_tried public.cart_line[];
  v_row RECORD;
  v_product public.products%ROWTYPE;
  v_d public.discounts%ROWTYPE;
  v_s public.discounts%ROWTYPE;
  v_unit NUMERIC;
  v_on_sale BOOLEAN;
  v_deposit NUMERIC;
  v_subtotal NUMERIC := 0;
  v_total_qty INT := 0;
  v_elig_sub NUMERIC;
  v_elig_qty INT;
  v_saving NUMERIC;
  v_blocked TEXT;
  v_is_code BOOLEAN;
  v_status TEXT := NULL;
  v_min_needed NUMERIC := NULL;
  v_code_exists BOOLEAN := false;
  v_cand public.discounts[] := '{}';
  v_cand_saving NUMERIC[] := '{}';
  v_used BOOLEAN[];
  v_selected public.discounts[] := '{}';
  v_pick INT;
  v_compatible BOOLEAN;
  v_applied JSONB := '[]'::jsonb;
  v_before NUMERIC;
  v_after NUMERIC;
  v_off_total NUMERIC := 0;
  v_free JSONB := NULL;
  v_items_after NUMERIC;
  v_ship_after NUMERIC;
  v_items_total NUMERIC := 0;
  v_items_now NUMERIC := 0;
  v_out_lines JSONB := '[]'::jsonb;
  v_line_total NUMERIC;
  v_due NUMERIC;
  v_pass INT;
  i INT;
  n INT;
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

  -- 2. Candidates: every amount-off / Buy X Get Y discount that is valid for this bag.
  FOR v_d IN
    SELECT * FROM public.discounts
    WHERE type IN ('percent', 'fixed', 'buy_x_get_y')
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

    v_tried := public.apply_discount_to_lines(v_lines, v_d);
    v_saving := 0;
    FOREACH v_line IN ARRAY v_tried LOOP v_saving := v_saving + v_line.discount; END LOOP;

    IF v_saving <= 0 THEN
      IF v_is_code THEN
        v_status := CASE WHEN v_d.type = 'buy_x_get_y' THEN 'bxgy_not_met' ELSE 'no_eligible_items' END;
        IF v_d.type = 'buy_x_get_y' THEN v_min_needed := v_d.buy_quantity; END IF;
      END IF;
      CONTINUE;
    END IF;

    v_cand := v_cand || v_d;
    v_cand_saving := v_cand_saving || v_saving;
  END LOOP;

  -- 3. Choose which candidates combine: best saving first, a typed code wins a tie; a candidate is
  --    added only if it combines with everything chosen so far.
  n := COALESCE(array_length(v_cand, 1), 0);
  IF n > 0 THEN
    v_used := array_fill(false, ARRAY[n]);
    FOR i IN 1 .. n LOOP
      v_pick := 0;
      FOR v_pass IN 1 .. n LOOP
        IF NOT v_used[v_pass] AND (
          v_pick = 0
          OR v_cand_saving[v_pass] > v_cand_saving[v_pick]
          OR (v_cand_saving[v_pass] = v_cand_saving[v_pick]
              AND (v_cand[v_pass]).method = 'code' AND (v_cand[v_pick]).method <> 'code')
        ) THEN
          v_pick := v_pass;
        END IF;
      END LOOP;
      v_used[v_pick] := true;
      v_d := v_cand[v_pick];

      v_compatible := true;
      FOREACH v_s IN ARRAY v_selected LOOP
        IF NOT public.discounts_combine(v_d, v_s) THEN v_compatible := false; END IF;
      END LOOP;

      IF v_compatible THEN
        v_selected := v_selected || v_d;
        IF v_d.method = 'code' THEN v_status := 'applied'; END IF;
      ELSIF v_d.method = 'code' THEN
        v_status := 'not_combinable';
      END IF;
    END LOOP;
  END IF;

  -- 4. Apply the chosen ones: product-class first, then order-class on what is left.
  FOR v_pass IN 1 .. 2 LOOP
    FOREACH v_s IN ARRAY v_selected LOOP
      IF (v_pass = 1 AND public.discount_class(v_s) = 'product')
         OR (v_pass = 2 AND public.discount_class(v_s) = 'order') THEN
        v_before := 0;
        FOREACH v_line IN ARRAY v_lines LOOP v_before := v_before + v_line.discount; END LOOP;
        v_lines := public.apply_discount_to_lines(v_lines, v_s);
        v_after := 0;
        FOREACH v_line IN ARRAY v_lines LOOP v_after := v_after + v_line.discount; END LOOP;
        v_applied := v_applied || jsonb_build_object(
          'id', v_s.id, 'name', v_s.name, 'code', v_s.code, 'type', v_s.type,
          'class', public.discount_class(v_s), 'amount', v_after - v_before);
        v_off_total := v_after;
      END IF;
    END LOOP;
  END LOOP;

  -- 5. Free shipping, if it combines with what was chosen.
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

      v_compatible := true;
      FOREACH v_s IN ARRAY v_selected LOOP
        IF NOT public.discounts_combine(v_d, v_s) THEN v_compatible := false; END IF;
      END LOOP;
      IF NOT v_compatible THEN
        IF v_is_code THEN v_status := 'not_combinable'; END IF;
        CONTINUE;
      END IF;

      v_free := jsonb_build_object(
        'id', v_d.id, 'name', v_d.name, 'code', v_d.code, 'type', v_d.type, 'class', 'shipping', 'amount', v_ship);
      v_applied := v_applied || v_free;
      IF v_is_code THEN v_status := 'applied'; END IF;
      EXIT;
    END LOOP;
  END IF;

  IF v_code <> '' AND NOT v_code_exists THEN v_status := 'invalid'; END IF;
  IF v_code <> '' AND v_status IS NULL THEN v_status := 'not_applicable'; END IF;

  v_ship_after := CASE WHEN v_free IS NOT NULL THEN 0 ELSE v_ship END;

  -- 6. Totals and the lines as JSON.
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
    'applied', v_applied,
    'free_shipping', v_free,
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

-- ---------------------------------------------------------------------------
-- place_order (replaces the 0017 version): records every applied discount
-- ---------------------------------------------------------------------------
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
  v_applied JSONB;
  v_product public.products%ROWTYPE;
  v_quantity INT;
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
  IF v_code <> '' AND COALESCE(v_priced ->> 'code_status', '') NOT IN ('applied', 'not_combinable') THEN
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
    -- unit_price is what the customer pays per unit, so refunds give back exactly that.
    INSERT INTO public.sales_order_items (
      sales_order_id, product_id, quantity, unit_price, list_unit_price, discount_amount
    ) VALUES (
      v_order.id, v_product.id, v_quantity,
      round(((v_line ->> 'line_total')::NUMERIC) / v_quantity, 2),
      (v_line ->> 'list_unit_price')::NUMERIC, (v_line ->> 'discount')::NUMERIC
    );
  END LOOP;

  FOR v_applied IN SELECT * FROM jsonb_array_elements(v_priced -> 'applied') LOOP
    INSERT INTO public.discount_redemptions (discount_id, sales_order_id, customer_email, amount)
    VALUES ((v_applied ->> 'id')::UUID, v_order.id, v_email, (v_applied ->> 'amount')::NUMERIC);
    v_codes := v_codes || COALESCE(NULLIF(v_applied ->> 'code', ''), v_applied ->> 'name');
  END LOOP;

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
