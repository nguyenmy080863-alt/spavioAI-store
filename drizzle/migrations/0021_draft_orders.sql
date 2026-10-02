-- Draft orders: staff build an order for a customer (phone, in person, wholesale quote) and turn it
-- into a real order later. Needs 0017 and 0018. Safe to run more than once.
--
-- A draft is NOT an order: it does not appear in Orders, Finance, Analytics or stock until it is
-- turned into an order. Stock is only reserved when the resulting order is paid (the existing
-- rule: an order reserves stock when it is marked paid).
--
--   Prices are locked: each item stores the catalogue price at the time it was added (list_price).
--   "Refresh prices" re-reads the catalogue on request. A custom price (never above the catalogue
--   price) and a custom discount (percentage or fixed amount) need a reason and are limited to
--   Super Admins and Order Processors. A custom discount replaces codes and automatic discounts.
--   Otherwise the same pricing engine as checkout prices the draft (codes, automatic discounts,
--   Buy X Get Y, free shipping), so a draft shows exactly what checkout would.
--
--   Two ways to finish a draft:
--     * Staff press "Create order": the order is created unpaid, or already paid (bank transfer,
--       cash, phone). Source = 'draft'.
--     * Payment link: the customer opens /pay/<token>, confirms the delivery address and pays with
--       PayPal. The order is created like a checkout order (source = 'checkout', so the checkout
--       email and payment-confirmation rules apply) and stays unpaid until staff confirm PayPal.
--
-- The pricing engine is split in two: price_cart builds lines from the products table, then
-- price_lines does the discount work on any lines (also used by drafts with locked prices).

-- ---------------------------------------------------------------------------
-- Order source 'draft'
-- ---------------------------------------------------------------------------
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.sales_orders'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%''checkout''%'
  LOOP
    EXECUTE format('ALTER TABLE public.sales_orders DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_source_check
    CHECK (source IN ('admin', 'checkout', 'exchange', 'draft'));
END $$;

-- Order emails also cover staff-created orders from drafts.
CREATE OR REPLACE FUNCTION public.enqueue_order_email(p_kind TEXT, p_order_id UUID, p_delivery_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.source NOT IN ('checkout', 'exchange', 'draft') OR position('@' IN v_order.customer_email) = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.email_outbox (kind, sales_order_id, delivery_order_id, to_email, language)
  VALUES (p_kind, p_order_id, p_delivery_id, v_order.customer_email, v_order.language)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_order_email(TEXT, UUID, UUID) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sales_order_email_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source IN ('checkout', 'draft') THEN
    IF OLD.payment_reported_at IS NULL AND NEW.payment_reported_at IS NOT NULL THEN
      PERFORM public.enqueue_order_email('order_received', NEW.id);
    END IF;
    IF OLD.payment_status = 'unpaid' AND NEW.payment_status = 'paid' THEN
      PERFORM public.enqueue_order_email('payment_confirmed', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.draft_order_seq START 1;

CREATE OR REPLACE FUNCTION public.can_price_orders(_user_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin', 'order_processor')
  )
$$;
REVOKE ALL ON FUNCTION public.can_price_orders(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_price_orders(UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS public.draft_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_number TEXT NOT NULL UNIQUE DEFAULT 'DR-' || lpad(nextval('public.draft_order_seq')::text, 5, '0'),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  language TEXT NOT NULL DEFAULT 'de' CHECK (language IN ('de', 'en', 'vi')),
  shipping_label TEXT NOT NULL DEFAULT '',
  shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0 AND shipping_cost <= 100),
  discount_code TEXT NOT NULL DEFAULT '',
  custom_discount_type TEXT CHECK (custom_discount_type IN ('percent', 'fixed')),
  custom_discount_value NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (custom_discount_value >= 0),
  custom_discount_reason TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  payment_link_token TEXT UNIQUE,
  payment_link_created_at TIMESTAMPTZ,
  payment_link_expires_at TIMESTAMPTZ,
  sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (custom_discount_type IS NULL OR custom_discount_value > 0),
  CHECK (custom_discount_type <> 'percent' OR custom_discount_value <= 100)
);
CREATE INDEX IF NOT EXISTS draft_orders_status_idx ON public.draft_orders (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.draft_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.draft_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  -- Catalogue price when the item was added or last refreshed (the locked price).
  list_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  on_sale BOOLEAN NOT NULL DEFAULT false,
  custom_price NUMERIC(10,2) CHECK (custom_price IS NULL OR custom_price >= 0),
  custom_price_reason TEXT NOT NULL DEFAULT '',
  -- What is charged per unit: the custom price if there is one, else the locked list price.
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_id, product_id)
);

CREATE OR REPLACE FUNCTION public.draft_item_before_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_draft public.draft_orders%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_draft_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.draft_id ELSE NEW.draft_id END;
  v_changed BOOLEAN := true;
BEGIN
  SELECT * INTO v_draft FROM public.draft_orders WHERE id = v_draft_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_draft.status <> 'open' OR v_draft.sales_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'This draft already has an order and can no longer be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_product FROM public.products
    WHERE id = NEW.product_id AND status = 'published' AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only published products can be added to a draft'; END IF;
    IF v_product.preorder_enabled THEN RAISE EXCEPTION 'Preorder products cannot be added to a draft yet'; END IF;
    NEW.on_sale := v_product.sale_price IS NOT NULL AND v_product.sale_price > 0 AND v_product.sale_price < v_product.price;
    NEW.list_price := CASE WHEN NEW.on_sale THEN v_product.sale_price ELSE v_product.price END;
  END IF;

  IF TG_OP = 'UPDATE' THEN v_changed := NEW.custom_price IS DISTINCT FROM OLD.custom_price; END IF;

  IF NEW.custom_price IS NOT NULL THEN
    IF auth.uid() IS NOT NULL AND NOT public.can_price_orders(auth.uid()) AND v_changed THEN
      RAISE EXCEPTION 'Only Super Admins and Order Processors can set a custom price';
    END IF;
    IF NEW.custom_price > NEW.list_price THEN
      RAISE EXCEPTION 'A custom price cannot be higher than the catalogue price';
    END IF;
    IF trim(NEW.custom_price_reason) = '' THEN RAISE EXCEPTION 'Give a reason for the custom price'; END IF;
  ELSE
    NEW.custom_price_reason := '';
  END IF;
  NEW.unit_price := COALESCE(NEW.custom_price, NEW.list_price);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS draft_order_items_before_write ON public.draft_order_items;
CREATE TRIGGER draft_order_items_before_write BEFORE INSERT OR UPDATE OR DELETE ON public.draft_order_items
FOR EACH ROW EXECUTE FUNCTION public.draft_item_before_write();

CREATE OR REPLACE FUNCTION public.draft_order_before_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_changed BOOLEAN := true;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.sales_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'A draft that created an order cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  END IF;
  NEW.updated_at := now();

  -- Once an order exists the contents are locked (status and link fields can still change).
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.status <> 'open' OR OLD.sales_order_id IS NOT NULL) AND (
         NEW.customer_name IS DISTINCT FROM OLD.customer_name OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
      OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone OR NEW.shipping_address IS DISTINCT FROM OLD.shipping_address
      OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost OR NEW.discount_code IS DISTINCT FROM OLD.discount_code
      OR NEW.custom_discount_type IS DISTINCT FROM OLD.custom_discount_type
      OR NEW.custom_discount_value IS DISTINCT FROM OLD.custom_discount_value
    ) THEN
      RAISE EXCEPTION 'This draft already has an order and can no longer be changed';
    END IF;
    v_changed := NEW.custom_discount_type IS DISTINCT FROM OLD.custom_discount_type
              OR NEW.custom_discount_value IS DISTINCT FROM OLD.custom_discount_value;
  END IF;

  IF NEW.custom_discount_type IS NOT NULL THEN
    IF auth.uid() IS NOT NULL AND NOT public.can_price_orders(auth.uid()) AND v_changed THEN
      RAISE EXCEPTION 'Only Super Admins and Order Processors can give a custom discount';
    END IF;
    IF trim(NEW.custom_discount_reason) = '' THEN RAISE EXCEPTION 'Give a reason for the custom discount'; END IF;
  ELSE
    NEW.custom_discount_value := 0;
    NEW.custom_discount_reason := '';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS draft_orders_before_write ON public.draft_orders;
CREATE TRIGGER draft_orders_before_write BEFORE INSERT OR UPDATE OR DELETE ON public.draft_orders
FOR EACH ROW EXECUTE FUNCTION public.draft_order_before_write();

-- A draft is completed when its order (created through the payment link) gets paid.
CREATE OR REPLACE FUNCTION public.draft_order_completed_on_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.payment_status = 'unpaid' AND NEW.payment_status = 'paid' THEN
    UPDATE public.draft_orders SET status = 'completed', completed_at = COALESCE(completed_at, now())
    WHERE sales_order_id = NEW.id AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sales_orders_complete_draft ON public.sales_orders;
CREATE TRIGGER sales_orders_complete_draft AFTER UPDATE OF payment_status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.draft_order_completed_on_paid();

-- ---------------------------------------------------------------------------
-- Pricing engine split: price_lines (discounts on any lines) + price_cart (lines from products)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.price_lines(
  p_lines public.cart_line[],
  p_code TEXT,
  p_email TEXT,
  p_shipping_cost NUMERIC,
  p_discounts BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_code TEXT := lower(trim(COALESCE(p_code, '')));
  v_ship NUMERIC := round(COALESCE(p_shipping_cost, 0), 2);
  v_lines public.cart_line[] := p_lines;
  v_line public.cart_line;
  v_tried public.cart_line[];
  v_d public.discounts%ROWTYPE;
  v_s public.discounts%ROWTYPE;
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
  IF v_lines IS NULL OR COALESCE(array_length(v_lines, 1), 0) = 0 THEN RAISE EXCEPTION 'Your bag is empty'; END IF;
  IF v_ship < 0 OR v_ship > 100 THEN RAISE EXCEPTION 'Invalid shipping cost'; END IF;

  FOREACH v_line IN ARRAY v_lines LOOP
    v_subtotal := v_subtotal + v_line.unit_price * v_line.quantity;
    v_total_qty := v_total_qty + v_line.quantity;
    v_off_total := v_off_total + v_line.discount;   -- discounts already on the lines (custom discount)
  END LOOP;

  IF p_discounts THEN
    -- Candidates: every amount-off / Buy X Get Y discount that is valid for this bag.
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

    -- Choose which candidates combine: best saving first, a typed code wins a tie.
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

    -- Apply the chosen ones: product-class first, then order-class on what is left.
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

    -- Free shipping, if it combines with what was chosen.
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
  END IF;

  v_ship_after := CASE WHEN v_free IS NOT NULL THEN 0 ELSE v_ship END;

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
REVOKE ALL ON FUNCTION public.price_lines(public.cart_line[], TEXT, TEXT, NUMERIC, BOOLEAN) FROM public, anon, authenticated;

-- price_cart: the bag from the products table, then price_lines (same output as before).
CREATE OR REPLACE FUNCTION public.price_cart(
  p_items JSONB,
  p_code TEXT,
  p_email TEXT,
  p_shipping_cost NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lines public.cart_line[] := '{}';
  v_line public.cart_line;
  v_row RECORD;
  v_product public.products%ROWTYPE;
  v_unit NUMERIC;
  v_on_sale BOOLEAN;
  v_deposit NUMERIC;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'Your bag is empty';
  END IF;

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
  END LOOP;

  RETURN public.price_lines(v_lines, p_code, p_email, p_shipping_cost, true);
END;
$$;
REVOKE ALL ON FUNCTION public.price_cart(JSONB, TEXT, TEXT, NUMERIC) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pricing a draft
-- ---------------------------------------------------------------------------
-- Custom discount spread over all lines (percentage of what each line is worth, or a fixed amount
-- shared in proportion, never more than the lines are worth).
CREATE OR REPLACE FUNCTION public.apply_custom_discount(p_lines public.cart_line[], p_type TEXT, p_value NUMERIC)
RETURNS public.cart_line[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_lines public.cart_line[] := p_lines;
  v_line public.cart_line;
  v_n INT := COALESCE(array_length(p_lines, 1), 0);
  v_total NUMERIC := 0;
  v_target NUMERIC;
  v_allocated NUMERIC := 0;
  v_alloc NUMERIC;
  v_rem NUMERIC;
  i INT;
BEGIN
  IF v_n = 0 OR p_type IS NULL THEN RETURN v_lines; END IF;
  FOR i IN 1 .. v_n LOOP
    v_total := v_total + v_lines[i].unit_price * v_lines[i].quantity - v_lines[i].discount;
  END LOOP;
  IF v_total <= 0 THEN RETURN v_lines; END IF;
  v_target := CASE WHEN p_type = 'percent' THEN round(v_total * p_value / 100, 2) ELSE least(p_value, v_total) END;

  FOR i IN 1 .. v_n LOOP
    v_line := v_lines[i];
    v_rem := v_line.unit_price * v_line.quantity - v_line.discount;
    v_alloc := CASE WHEN i = v_n THEN v_target - v_allocated ELSE round(v_target * v_rem / v_total, 2) END;
    v_allocated := v_allocated + v_alloc;
    v_line.discount := v_line.discount + least(v_alloc, v_rem);
    v_lines[i] := v_line;
  END LOOP;
  RETURN v_lines;
END;
$$;

-- Internal: the priced draft (locked prices, custom price / discount, or the checkout engine).
CREATE OR REPLACE FUNCTION public.price_draft(p_draft_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_d public.draft_orders%ROWTYPE;
  v_lines public.cart_line[] := '{}';
  v_row RECORD;
  v_priced JSONB;
  v_list_total NUMERIC := 0;
  v_custom_amount NUMERIC := 0;
  v_short JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO v_d FROM public.draft_orders WHERE id = p_draft_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;

  FOR v_row IN
    SELECT i.product_id, i.quantity, i.unit_price, i.list_price, i.on_sale, i.custom_price,
           p.slug, p.name, p.category, p.stock
    FROM public.draft_order_items i JOIN public.products p ON p.id = i.product_id
    WHERE i.draft_id = p_draft_id ORDER BY p.slug
  LOOP
    -- A custom price counts as "on sale", so sale-excluding discounts leave it alone.
    v_lines := v_lines || ROW(v_row.product_id, v_row.slug, v_row.name, v_row.category, v_row.quantity,
                              v_row.unit_price, v_row.on_sale OR v_row.custom_price IS NOT NULL,
                              false, NULL, 0)::public.cart_line;
    v_list_total := v_list_total + v_row.list_price * v_row.quantity;
    IF v_row.quantity > v_row.stock THEN
      v_short := v_short || jsonb_build_object('name', v_row.name, 'requested', v_row.quantity, 'available', v_row.stock);
    END IF;
  END LOOP;
  IF COALESCE(array_length(v_lines, 1), 0) = 0 THEN RAISE EXCEPTION 'Add at least one item to the draft'; END IF;

  IF v_d.custom_discount_type IS NOT NULL THEN
    v_lines := public.apply_custom_discount(v_lines, v_d.custom_discount_type, v_d.custom_discount_value);
    v_priced := public.price_lines(v_lines, '', v_d.customer_email, v_d.shipping_cost, false);
    v_custom_amount := (v_priced ->> 'discount_total')::NUMERIC;
  ELSE
    v_priced := public.price_lines(v_lines, v_d.discount_code, v_d.customer_email, v_d.shipping_cost, true);
  END IF;

  RETURN v_priced || jsonb_build_object(
    'list_total', v_list_total,
    'custom_discount_amount', v_custom_amount,
    'short_stock', v_short
  );
END;
$$;
REVOKE ALL ON FUNCTION public.price_draft(UUID) FROM public, anon, authenticated;

-- Staff: what the draft costs right now.
CREATE OR REPLACE FUNCTION public.draft_pricing(p_draft_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN public.price_draft(p_draft_id);
END;
$$;
REVOKE ALL ON FUNCTION public.draft_pricing(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.draft_pricing(UUID) TO authenticated;

-- Staff: re-read the catalogue prices (custom prices stay).
CREATE OR REPLACE FUNCTION public.refresh_draft_prices(p_draft_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_draft public.draft_orders%ROWTYPE;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO v_draft FROM public.draft_orders WHERE id = p_draft_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_draft.status <> 'open' OR v_draft.sales_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'This draft already has an order and can no longer be changed';
  END IF;

  UPDATE public.draft_order_items i
  SET on_sale = (p.sale_price IS NOT NULL AND p.sale_price > 0 AND p.sale_price < p.price),
      list_price = CASE WHEN p.sale_price IS NOT NULL AND p.sale_price > 0 AND p.sale_price < p.price
                        THEN p.sale_price ELSE p.price END,
      custom_price = CASE WHEN i.custom_price IS NOT NULL
                          THEN least(i.custom_price, CASE WHEN p.sale_price IS NOT NULL AND p.sale_price > 0 AND p.sale_price < p.price
                                                          THEN p.sale_price ELSE p.price END)
                          END
  FROM public.products p
  WHERE i.draft_id = p_draft_id AND p.id = i.product_id;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_draft_prices(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_draft_prices(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Turning a draft into an order
-- ---------------------------------------------------------------------------
-- Internal: creates the order from the draft (unpaid). p_source is 'draft' (staff) or 'checkout'
-- (customer through the payment link).
CREATE OR REPLACE FUNCTION public.create_order_from_draft_core(
  p_draft_id UUID,
  p_source TEXT,
  p_marketing_consent BOOLEAN DEFAULT false
) RETURNS public.sales_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_d public.draft_orders%ROWTYPE;
  v_priced JSONB;
  v_order public.sales_orders%ROWTYPE;
  v_line JSONB;
  v_item public.draft_order_items%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_applied JSONB;
  v_codes TEXT[] := '{}';
  v_quantity INT;
  v_line_total NUMERIC;
  v_user UUID;
BEGIN
  SELECT * INTO v_d FROM public.draft_orders WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_d.status <> 'open' OR v_d.sales_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'This draft already has an order';
  END IF;
  IF trim(v_d.customer_name) = '' AND trim(v_d.customer_email) = '' THEN
    RAISE EXCEPTION 'Enter the customer name or email';
  END IF;

  -- Serialise orders that could use the same discount, so a usage limit cannot be overrun.
  PERFORM 1 FROM public.discounts
  WHERE active AND (method = 'automatic' OR (v_d.discount_code <> '' AND lower(code) = lower(v_d.discount_code)))
  FOR UPDATE;

  v_priced := public.price_draft(p_draft_id);

  IF v_d.custom_discount_type IS NULL AND v_d.discount_code <> ''
     AND COALESCE(v_priced ->> 'code_status', '') NOT IN ('applied', 'not_combinable') THEN
    RAISE EXCEPTION 'discount:%', COALESCE(v_priced ->> 'code_status', 'invalid');
  END IF;

  INSERT INTO public.sales_orders (
    customer_id, customer_name, customer_email, customer_phone, shipping_address,
    shipping_cost, source, language
  ) VALUES (
    v_d.customer_id, v_d.customer_name, lower(trim(v_d.customer_email)), v_d.customer_phone, v_d.shipping_address,
    (v_priced ->> 'shipping_cost')::NUMERIC, p_source, v_d.language
  ) RETURNING * INTO v_order;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_priced -> 'lines') LOOP
    v_quantity := (v_line ->> 'quantity')::INT;
    SELECT * INTO v_product FROM public.products WHERE id = (v_line ->> 'product_id')::UUID;
    IF v_quantity > v_product.stock THEN
      RAISE EXCEPTION 'Not enough stock for % (% available)', v_product.name, v_product.stock;
    END IF;
    SELECT * INTO v_item FROM public.draft_order_items
    WHERE draft_id = p_draft_id AND product_id = v_product.id;
    v_line_total := (v_line ->> 'line_total')::NUMERIC;

    -- unit_price is what the customer pays per unit; list price and discount sit next to it.
    INSERT INTO public.sales_order_items (
      sales_order_id, product_id, quantity, unit_price, list_unit_price, discount_amount
    ) VALUES (
      v_order.id, v_product.id, v_quantity, round(v_line_total / v_quantity, 2),
      v_item.list_price, v_item.list_price * v_quantity - v_line_total
    );
  END LOOP;

  FOR v_applied IN SELECT * FROM jsonb_array_elements(v_priced -> 'applied') LOOP
    INSERT INTO public.discount_redemptions (discount_id, sales_order_id, customer_email, amount)
    VALUES ((v_applied ->> 'id')::UUID, v_order.id, lower(trim(v_d.customer_email)), (v_applied ->> 'amount')::NUMERIC);
    v_codes := v_codes || COALESCE(NULLIF(v_applied ->> 'code', ''), v_applied ->> 'name');
  END LOOP;
  IF v_d.custom_discount_type IS NOT NULL THEN v_codes := v_codes || 'Custom discount'; END IF;
  IF EXISTS (SELECT 1 FROM public.draft_order_items WHERE draft_id = p_draft_id AND custom_price IS NOT NULL) THEN
    v_codes := v_codes || 'Custom price';
  END IF;

  -- discount_amount is everything taken off the catalogue prices (codes, custom price, custom discount).
  UPDATE public.sales_orders
  SET total = (v_priced ->> 'total')::NUMERIC,
      amount_charged = (v_priced ->> 'amount_charged')::NUMERIC,
      balance_due = 0,
      discount_code = array_to_string(v_codes, ', '),
      discount_amount = (v_priced ->> 'list_total')::NUMERIC - (v_priced ->> 'items_total')::NUMERIC,
      shipping_discount = CASE WHEN jsonb_typeof(v_priced -> 'free_shipping') = 'object'
                               THEN (v_priced ->> 'shipping_cost_original')::NUMERIC ELSE 0 END,
      payment_method = ''
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  IF COALESCE(p_marketing_consent, false) AND v_d.customer_email <> '' THEN
    SELECT id INTO v_user FROM auth.users WHERE id = v_d.customer_id AND lower(email) = lower(trim(v_d.customer_email));
    PERFORM public.upsert_customer(v_d.customer_email, v_d.customer_name, v_d.customer_phone, v_user, 'order', true, 'payment link');
  END IF;

  UPDATE public.draft_orders SET sales_order_id = v_order.id WHERE id = p_draft_id;
  RETURN v_order;
END;
$$;
REVOKE ALL ON FUNCTION public.create_order_from_draft_core(UUID, TEXT, BOOLEAN) FROM public, anon, authenticated;

-- Staff: create the order, unpaid, or already paid by another way (bank transfer, cash, phone).
CREATE OR REPLACE FUNCTION public.create_order_from_draft(
  p_draft_id UUID,
  p_mark_paid BOOLEAN DEFAULT false,
  p_payment_method TEXT DEFAULT '',
  p_payment_reference TEXT DEFAULT ''
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_mark_paid AND trim(COALESCE(p_payment_method, '')) = '' THEN
    RAISE EXCEPTION 'Choose how the customer paid';
  END IF;

  v_order := public.create_order_from_draft_core(p_draft_id, 'draft', false);

  UPDATE public.sales_orders
  SET payment_method = left(trim(COALESCE(p_payment_method, '')), 20),
      payment_reference = left(trim(COALESCE(p_payment_reference, '')), 120)
  WHERE id = v_order.id;

  -- Paying reserves the stock (existing order rule) and queues the payment confirmation email.
  IF p_mark_paid THEN
    UPDATE public.sales_orders SET payment_status = 'paid' WHERE id = v_order.id;
  END IF;

  UPDATE public.draft_orders SET status = 'completed', completed_at = now() WHERE id = p_draft_id;

  RETURN jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'paid', p_mark_paid);
END;
$$;
REVOKE ALL ON FUNCTION public.create_order_from_draft(UUID, BOOLEAN, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_order_from_draft(UUID, BOOLEAN, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Payment link
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_draft_payment_link(p_draft_id UUID, p_hours INT DEFAULT 72)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_d public.draft_orders%ROWTYPE;
  v_token TEXT := replace(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, '-', '');
  v_hours INT := least(greatest(COALESCE(p_hours, 72), 1), 24 * 30);
  v_priced JSONB;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO v_d FROM public.draft_orders WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_d.status <> 'open' OR v_d.sales_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'This draft already has an order';
  END IF;
  IF v_d.customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter the customer email first (the order and its updates belong to that email)';
  END IF;
  IF trim(v_d.customer_name) = '' THEN RAISE EXCEPTION 'Enter the customer name first'; END IF;

  -- Make sure it can be priced (items present, code still valid) before a link goes out.
  v_priced := public.price_draft(p_draft_id);
  IF v_d.custom_discount_type IS NULL AND v_d.discount_code <> ''
     AND COALESCE(v_priced ->> 'code_status', '') NOT IN ('applied', 'not_combinable') THEN
    RAISE EXCEPTION 'discount:%', COALESCE(v_priced ->> 'code_status', 'invalid');
  END IF;

  UPDATE public.draft_orders
  SET payment_link_token = v_token,
      payment_link_created_at = now(),
      payment_link_expires_at = now() + make_interval(hours => v_hours)
  WHERE id = p_draft_id;

  RETURN jsonb_build_object('token', v_token, 'expires_at', now() + make_interval(hours => v_hours));
END;
$$;
REVOKE ALL ON FUNCTION public.create_draft_payment_link(UUID, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_draft_payment_link(UUID, INT) TO authenticated;

-- Customer (anonymous): what the link shows.
CREATE OR REPLACE FUNCTION public.get_draft_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_d public.draft_orders%ROWTYPE;
  v_order public.sales_orders%ROWTYPE;
  v_priced JSONB;
  v_status TEXT;
BEGIN
  SELECT * INTO v_d FROM public.draft_orders
  WHERE payment_link_token = trim(COALESCE(p_token, '')) AND length(trim(COALESCE(p_token, ''))) >= 32;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_d.sales_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.sales_orders WHERE id = v_d.sales_order_id;
    v_status := CASE WHEN v_order.payment_status = 'paid' THEN 'paid'
                     WHEN v_order.status = 'cancelled' THEN 'cancelled'
                     ELSE 'awaiting_payment' END;
  ELSIF v_d.payment_link_expires_at < now() THEN
    v_status := 'expired';
  ELSE
    v_status := 'open';
  END IF;

  IF v_d.sales_order_id IS NULL AND v_status = 'open' THEN
    v_priced := public.price_draft(v_d.id);
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'draft_number', v_d.draft_number,
    'customer_name', v_d.customer_name,
    'customer_email', v_d.customer_email,
    'customer_phone', v_d.customer_phone,
    'shipping_address', v_d.shipping_address,
    'expires_at', v_d.payment_link_expires_at,
    'order_number', v_order.order_number,
    'amount_due', COALESCE(v_order.amount_charged, (v_priced ->> 'amount_charged')::NUMERIC),
    'pricing', v_priced
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_draft_by_token(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.get_draft_by_token(TEXT) TO anon, authenticated;

-- Customer (anonymous): confirm the address and start the payment. Safe to call again: the order
-- that already exists is returned, never a second one.
CREATE OR REPLACE FUNCTION public.place_order_from_draft(
  p_token TEXT,
  p_phone TEXT,
  p_address JSONB,
  p_marketing_consent BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_d public.draft_orders%ROWTYPE;
  v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_d FROM public.draft_orders
  WHERE payment_link_token = trim(COALESCE(p_token, '')) AND length(trim(COALESCE(p_token, ''))) >= 32
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This payment link is not valid'; END IF;

  IF v_d.sales_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.sales_orders WHERE id = v_d.sales_order_id;
    IF v_order.payment_status = 'paid' THEN RAISE EXCEPTION 'This order has already been paid'; END IF;
    IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'This order was cancelled. Please contact us.'; END IF;
  ELSE
    IF v_d.status <> 'open' THEN RAISE EXCEPTION 'This payment link is no longer valid'; END IF;
    IF v_d.payment_link_expires_at < now() THEN RAISE EXCEPTION 'This payment link has expired. Please ask us for a new one.'; END IF;
    IF p_address IS NULL OR jsonb_typeof(p_address) <> 'object'
       OR trim(COALESCE(p_address ->> 'address', '')) = ''
       OR trim(COALESCE(p_address ->> 'city', '')) = ''
       OR trim(COALESCE(p_address ->> 'postal_code', '')) = '' THEN
      RAISE EXCEPTION 'Enter your full shipping address';
    END IF;

    UPDATE public.draft_orders
    SET shipping_address = jsonb_build_object(
          'address', left(trim(p_address ->> 'address'), 200),
          'city', left(trim(p_address ->> 'city'), 100),
          'postal_code', left(trim(p_address ->> 'postal_code'), 20),
          'country', left(trim(COALESCE(p_address ->> 'country', '')), 80)),
        customer_phone = CASE WHEN trim(COALESCE(p_phone, '')) <> '' THEN left(trim(p_phone), 40) ELSE customer_phone END
    WHERE id = v_d.id;

    v_order := public.create_order_from_draft_core(v_d.id, 'checkout', COALESCE(p_marketing_consent, false));
    UPDATE public.sales_orders SET payment_method = 'paypal' WHERE id = v_order.id RETURNING * INTO v_order;
  END IF;

  RETURN jsonb_build_object(
    'order_number', v_order.order_number,
    'customer_email', v_order.customer_email,
    'amount_charged', v_order.amount_charged,
    'total', v_order.total
  );
END;
$$;
REVOKE ALL ON FUNCTION public.place_order_from_draft(TEXT, TEXT, JSONB, BOOLEAN) FROM public;
GRANT EXECUTE ON FUNCTION public.place_order_from_draft(TEXT, TEXT, JSONB, BOOLEAN) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.draft_orders, public.draft_order_items TO authenticated;
GRANT ALL ON public.draft_orders, public.draft_order_items TO service_role;
GRANT USAGE ON SEQUENCE public.draft_order_seq TO authenticated, service_role;

ALTER TABLE public.draft_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage drafts" ON public.draft_orders;
CREATE POLICY "Staff manage drafts" ON public.draft_orders
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff manage draft items" ON public.draft_order_items;
CREATE POLICY "Staff manage draft items" ON public.draft_order_items
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
