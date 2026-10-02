-- Order emails (queue only) and the customer order views.
--
-- EMAILS. The database decides WHEN an email is due and writes a row to email_outbox. Sending is a
-- separate step: the Edge Function in supabase/functions/send-order-emails reads the pending rows,
-- renders the template in the order's language and calls the email provider. Until that function is
-- deployed and a provider is connected, rows simply stay "pending" (nothing is lost).
--
--   order_received     the customer finished paying at checkout (payment reference reported)
--   payment_confirmed  an admin marked the order as paid
--   order_shipped      a delivery of the order went on its way (preparing -> on_delivery)
--
-- Only orders placed at checkout trigger emails (not orders an admin typed in), and each email is
-- queued at most once per order (or per delivery for "shipped").
--
-- ORDER VIEWS. get_customer_order() (order number + email, for guests) and list_my_orders()
-- (signed-in customers) return what a customer may see, including delivery tracking, which the
-- delivery tables themselves keep staff-only.

-- ---------------------------------------------------------------------------
-- Language on orders; place_order learns it
-- ---------------------------------------------------------------------------
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'de' CHECK (language IN ('de', 'en', 'vi'));

DROP FUNCTION IF EXISTS public.place_order(TEXT, TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.place_order(
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_address JSONB,
  p_items JSONB,
  p_shipping_cost NUMERIC,
  p_payment_method TEXT,
  p_marketing_consent BOOLEAN,
  p_language TEXT DEFAULT 'de'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_name TEXT := trim(COALESCE(p_name, ''));
  v_ship NUMERIC := round(COALESCE(p_shipping_cost, 0), 2);
  v_language TEXT := CASE WHEN p_language IN ('de', 'en', 'vi') THEN p_language ELSE 'de' END;
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
    shipping_cost, payment_method, source, language
  ) VALUES (
    auth.uid(), v_name, v_email, left(trim(COALESCE(p_phone, '')), 40),
    jsonb_build_object(
      'address', left(trim(p_address ->> 'address'), 200),
      'city', left(trim(p_address ->> 'city'), 100),
      'postal_code', left(trim(p_address ->> 'postal_code'), 20),
      'country', left(trim(COALESCE(p_address ->> 'country', '')), 80)
    ),
    v_ship, left(trim(COALESCE(p_payment_method, '')), 20), 'checkout', v_language
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

REVOKE ALL ON FUNCTION public.place_order(TEXT, TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT, BOOLEAN, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.place_order(TEXT, TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Email outbox and the rules that fill it
-- ---------------------------------------------------------------------------
CREATE TABLE public.email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('order_received', 'payment_confirmed', 'order_shipped')),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  delivery_order_id UUID REFERENCES public.delivery_orders(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'de',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
-- One email of each kind per order (per delivery for "shipped").
CREATE UNIQUE INDEX email_outbox_once_idx
  ON public.email_outbox (kind, sales_order_id, COALESCE(delivery_order_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX email_outbox_pending_idx ON public.email_outbox (created_at) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.enqueue_order_email(p_kind TEXT, p_order_id UUID, p_delivery_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.source <> 'checkout' OR position('@' IN v_order.customer_email) = 0 THEN
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
  -- The customer finished paying at checkout.
  IF OLD.payment_reported_at IS NULL AND NEW.payment_reported_at IS NOT NULL THEN
    PERFORM public.enqueue_order_email('order_received', NEW.id);
  END IF;
  -- An admin confirmed the payment.
  IF OLD.payment_status = 'unpaid' AND NEW.payment_status = 'paid' THEN
    PERFORM public.enqueue_order_email('payment_confirmed', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_orders_email_rules AFTER UPDATE OF payment_status, payment_reported_at ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.sales_order_email_rules();

CREATE OR REPLACE FUNCTION public.delivery_order_email_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- The carrier has picked the parcel up.
  IF OLD.status IS DISTINCT FROM 'on_delivery' AND NEW.status = 'on_delivery' THEN
    PERFORM public.enqueue_order_email('order_shipped', NEW.sales_order_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER delivery_orders_email_rules AFTER UPDATE OF status ON public.delivery_orders
FOR EACH ROW EXECUTE FUNCTION public.delivery_order_email_rules();

GRANT SELECT, UPDATE ON public.email_outbox TO authenticated;
GRANT ALL ON public.email_outbox TO service_role;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read email outbox" ON public.email_outbox
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
-- Staff can put a failed email back in the queue.
CREATE POLICY "Staff retry emails" ON public.email_outbox
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- What a customer may see of an order
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
    -- The 2-year warranty starts when the first delivery arrives.
    'warranty_expires_at', (
      SELECT min(d.delivered_at) + interval '2 years'
      FROM public.delivery_orders d WHERE d.sales_order_id = o.id AND d.status = 'delivered'
    )
  )
  FROM public.sales_orders o WHERE o.id = p_order_id
$$;
REVOKE ALL ON FUNCTION public.order_detail_json(UUID) FROM public, anon, authenticated;

-- Guests: order number + email.
CREATE OR REPLACE FUNCTION public.get_customer_order(p_order_number TEXT, p_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders
  WHERE upper(order_number) = upper(trim(COALESCE(p_order_number, '')));
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT (
    (auth.uid() IS NOT NULL AND v_order.customer_id = auth.uid())
    OR (v_order.customer_email <> '' AND lower(v_order.customer_email) = lower(trim(COALESCE(p_email, ''))))
  ) THEN
    RETURN NULL;
  END IF;

  RETURN public.order_detail_json(v_order.id);
END;
$$;

-- Signed-in customers: their own orders, plus earlier guest orders placed with the same email once
-- that email is confirmed on the account.
CREATE OR REPLACE FUNCTION public.list_my_orders()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL;

  RETURN COALESCE((
    SELECT jsonb_agg(public.order_detail_json(o.id) ORDER BY o.created_at DESC)
    FROM (
      SELECT id, created_at FROM public.sales_orders
      WHERE customer_id = v_uid OR (v_email IS NOT NULL AND lower(customer_email) = v_email)
      ORDER BY created_at DESC LIMIT 50
    ) o
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_order(TEXT, TEXT) FROM public;
REVOKE ALL ON FUNCTION public.list_my_orders() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_order(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_orders() TO authenticated;
