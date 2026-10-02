-- Returns, part 2: return emails, prepaid return labels, refund deduction, PayPal refunds, exchanges.
--
-- RETURN EMAILS reuse the email_outbox queue of migration 0014 (rules below decide when an email is
-- due; the Edge Function send-order-emails sends them once a provider is connected).
--
-- PREPAID LABELS are created by the Edge Function create-return-label (Sendcloud), because the
-- Sendcloud keys must stay on the server. We pay for the label. The cost is stored on the return
-- (label_cost) and can be deducted from the refund (refund_deduction), by hand or by the store
-- setting return_label_deduct_default (never for defective or wrong items).
--
-- PAYPAL REFUNDS are issued by the Edge Function refund-return. Until PayPal is connected, staff
-- keep refunding by hand and press "Mark as refunded".
--
-- EXCHANGES are returns with resolution = 'exchange': the customer picks a replacement per returned
-- item. When the parcel is received, complete_exchange() creates the replacement order and works out
-- the settlement:   settlement = value of replacement items - (value returned - deduction)
--   settlement > 0  the customer owes the difference (replacement order stays unpaid until collected)
--   settlement = 0  the replacement ships right away
--   settlement < 0  the replacement ships right away and the difference is refunded
--
-- Safe to run more than once. Needs 0014 and 0015.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS resolution TEXT NOT NULL DEFAULT 'refund',
  ADD COLUMN IF NOT EXISTS label_parcel_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS label_tracking_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS label_carrier TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS label_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_deduction NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS replacement_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_requests_resolution_check') THEN
    ALTER TABLE public.return_requests ADD CONSTRAINT return_requests_resolution_check
      CHECK (resolution IN ('refund', 'exchange'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_requests_amounts_check') THEN
    ALTER TABLE public.return_requests ADD CONSTRAINT return_requests_amounts_check
      CHECK (label_cost >= 0 AND refund_deduction >= 0);
  END IF;
END $$;

ALTER TABLE public.return_items
  ADD COLUMN IF NOT EXISTS exchange_product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS exchange_unit_price NUMERIC(10,2);

-- Replacement orders are a new kind of sales order.
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
    CHECK (source IN ('admin', 'checkout', 'exchange'));
END $$;

-- ---------------------------------------------------------------------------
-- Store settings (small key/value table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.store_settings (key, value) VALUES ('return_label_deduct_default', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read store settings" ON public.store_settings;
CREATE POLICY "Staff read store settings" ON public.store_settings
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Admins write store settings" ON public.store_settings;
CREATE POLICY "Admins write store settings" ON public.store_settings
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- What the customer must be told before returning (the deduction has to be disclosed up front).
CREATE OR REPLACE FUNCTION public.get_return_policy()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'window_days', public.return_window_days(),
    'deduct_label_cost', COALESCE(
      (SELECT (value #>> '{}')::boolean FROM public.store_settings WHERE key = 'return_label_deduct_default'),
      false)
  )
$$;
REVOKE ALL ON FUNCTION public.get_return_policy() FROM public;
GRANT EXECUTE ON FUNCTION public.get_return_policy() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage for label PDFs (private; only the Edge Functions read it)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('return-labels', 'return-labels', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Status rules (replaces the 0015 trigger function)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_request_before_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.refund_deduction > NEW.refund_amount THEN
    RAISE EXCEPTION 'The deduction cannot be higher than the refund amount';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'requested' AND NEW.status IN ('approved', 'rejected', 'cancelled'))
      OR (OLD.status = 'approved' AND NEW.status IN ('received', 'cancelled'))
      OR (OLD.status = 'received' AND NEW.status = 'refunded')
    ) THEN
      RAISE EXCEPTION 'A return cannot go from % to %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'rejected' AND trim(NEW.customer_message) = '' THEN
      RAISE EXCEPTION 'Write the reason for rejecting the return (the customer sees it)';
    END IF;
    IF NEW.status = 'refunded' AND NEW.resolution = 'exchange' AND NEW.replacement_order_id IS NULL THEN
      RAISE EXCEPTION 'Create the replacement order before completing an exchange';
    END IF;
    IF NEW.status = 'approved' THEN NEW.approved_at := now(); END IF;
    IF NEW.status = 'received' THEN NEW.received_at := now(); END IF;
    IF NEW.status = 'refunded' THEN NEW.refunded_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Return emails: queue rules
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS return_request_id UUID REFERENCES public.return_requests(id) ON DELETE CASCADE;

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.email_outbox'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%order_received%'
  LOOP
    EXECUTE format('ALTER TABLE public.email_outbox DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.email_outbox ADD CONSTRAINT email_outbox_kind_check CHECK (kind IN (
    'order_received', 'payment_confirmed', 'order_shipped',
    'return_requested', 'return_approved', 'return_rejected', 'return_label_ready',
    'return_received', 'return_refunded'
  ));
END $$;

DROP INDEX IF EXISTS public.email_outbox_once_idx;
CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_once_v2_idx ON public.email_outbox (
  kind, sales_order_id,
  COALESCE(delivery_order_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(return_request_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- Order emails also cover replacement orders created by an exchange.
CREATE OR REPLACE FUNCTION public.enqueue_order_email(p_kind TEXT, p_order_id UUID, p_delivery_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.source NOT IN ('checkout', 'exchange') OR position('@' IN v_order.customer_email) = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.email_outbox (kind, sales_order_id, delivery_order_id, to_email, language)
  VALUES (p_kind, p_order_id, p_delivery_id, v_order.customer_email, v_order.language)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_order_email(TEXT, UUID, UUID) FROM public, anon, authenticated;

-- "Received" and "payment confirmed" only make sense for orders paid at checkout.
CREATE OR REPLACE FUNCTION public.sales_order_email_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source = 'checkout' THEN
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

CREATE OR REPLACE FUNCTION public.enqueue_return_email(p_kind TEXT, p_return_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_return public.return_requests%ROWTYPE;
  v_language TEXT;
BEGIN
  SELECT * INTO v_return FROM public.return_requests WHERE id = p_return_id;
  IF NOT FOUND OR position('@' IN v_return.customer_email) = 0
     OR v_return.customer_email LIKE '%@anonymised.invalid' THEN
    RETURN;
  END IF;
  SELECT language INTO v_language FROM public.sales_orders WHERE id = v_return.sales_order_id;
  INSERT INTO public.email_outbox (kind, sales_order_id, return_request_id, to_email, language)
  VALUES (p_kind, v_return.sales_order_id, v_return.id, v_return.customer_email, COALESCE(v_language, 'de'))
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_return_email(TEXT, UUID) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.return_request_email_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_return_email('return_requested', NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN PERFORM public.enqueue_return_email('return_approved', NEW.id); END IF;
    IF NEW.status = 'rejected' THEN PERFORM public.enqueue_return_email('return_rejected', NEW.id); END IF;
    IF NEW.status = 'received' THEN PERFORM public.enqueue_return_email('return_received', NEW.id); END IF;
    IF NEW.status = 'refunded' THEN PERFORM public.enqueue_return_email('return_refunded', NEW.id); END IF;
  END IF;
  IF OLD.label_created_at IS NULL AND NEW.label_created_at IS NOT NULL THEN
    PERFORM public.enqueue_return_email('return_label_ready', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS return_requests_email_insert ON public.return_requests;
CREATE TRIGGER return_requests_email_insert AFTER INSERT ON public.return_requests
FOR EACH ROW EXECUTE FUNCTION public.return_request_email_rules();
DROP TRIGGER IF EXISTS return_requests_email_update ON public.return_requests;
CREATE TRIGGER return_requests_email_update AFTER UPDATE OF status, label_created_at ON public.return_requests
FOR EACH ROW EXECUTE FUNCTION public.return_request_email_rules();

-- ---------------------------------------------------------------------------
-- create_return_request: now with refund / exchange
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_return_request(TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN);

CREATE OR REPLACE FUNCTION public.create_return_request(
  p_order_number TEXT,
  p_email TEXT,
  p_reason TEXT,
  p_note TEXT,
  p_items JSONB,
  p_condition_confirmed BOOLEAN,
  p_resolution TEXT DEFAULT 'refund'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_resolution TEXT := CASE WHEN p_resolution = 'exchange' THEN 'exchange' ELSE 'refund' END;
  v_order public.sales_orders%ROWTYPE;
  v_request public.return_requests%ROWTYPE;
  v_line RECORD;
  v_item RECORD;
  v_new public.products%ROWTYPE;
  v_refund NUMERIC := 0;
  v_new_price NUMERIC;
BEGIN
  IF p_reason NOT IN ('changed_mind', 'not_suitable', 'defective', 'wrong_item', 'other') THEN
    RAISE EXCEPTION 'Choose a reason for the return';
  END IF;
  IF NOT COALESCE(p_condition_confirmed, false) THEN
    RAISE EXCEPTION 'Please confirm that the device is complete and in its original packaging';
  END IF;
  IF char_length(COALESCE(p_note, '')) > 2000 THEN RAISE EXCEPTION 'The note is too long'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'Choose at least one item to return';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders
  WHERE upper(order_number) = upper(trim(COALESCE(p_order_number, '')))
    AND customer_email <> '' AND lower(customer_email) = v_email;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'We could not find this order. Check the order number and email.';
  END IF;
  IF v_order.status = 'cancelled' OR v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Only paid orders can be returned';
  END IF;

  IF (SELECT count(*) FROM public.return_requests
      WHERE lower(customer_email) = v_email AND created_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'Too many return requests today. Please contact support.';
  END IF;

  INSERT INTO public.return_requests (
    sales_order_id, reason, customer_note, condition_confirmed, customer_id,
    customer_name, customer_email, resolution
  ) VALUES (
    v_order.id, p_reason, trim(COALESCE(p_note, '')), true, auth.uid(),
    v_order.customer_name, v_order.customer_email, v_resolution
  ) RETURNING * INTO v_request;

  FOR v_line IN
    SELECT x.sales_order_item_id AS item_id, sum(x.quantity)::INT AS quantity, max(x.exchange_slug) AS exchange_slug
    FROM jsonb_to_recordset(p_items) AS x(sales_order_item_id UUID, quantity INT, exchange_slug TEXT)
    GROUP BY x.sales_order_item_id
  LOOP
    SELECT * INTO v_item FROM public.order_returnable_items(v_order.id) i
    WHERE i.sales_order_item_id = v_line.item_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'An item does not belong to this order'; END IF;
    IF v_item.delivered_at IS NULL THEN
      RAISE EXCEPTION '% has not been delivered yet', v_item.name;
    END IF;
    IF NOT v_item.in_window THEN
      RAISE EXCEPTION 'The % day return period for % has ended', public.return_window_days(), v_item.name;
    END IF;
    IF v_line.quantity IS NULL OR v_line.quantity < 1 OR v_line.quantity > v_item.quantity_returnable THEN
      RAISE EXCEPTION 'You can return at most % of %', v_item.quantity_returnable, v_item.name;
    END IF;

    v_new := NULL;
    v_new_price := NULL;
    IF v_resolution = 'exchange' THEN
      IF v_line.exchange_slug IS NULL OR v_line.exchange_slug = '' THEN
        RAISE EXCEPTION 'Choose a replacement for %', v_item.name;
      END IF;
      SELECT * INTO v_new FROM public.products
      WHERE slug = v_line.exchange_slug AND status = 'published' AND archived_at IS NULL
        AND NOT preorder_enabled;
      IF NOT FOUND THEN RAISE EXCEPTION 'The replacement for % is not available', v_item.name; END IF;
      IF v_new.stock < v_line.quantity THEN
        RAISE EXCEPTION 'Not enough stock for the replacement %', v_new.name;
      END IF;
      v_new_price := COALESCE(v_new.sale_price, v_new.price);
    END IF;

    INSERT INTO public.return_items (
      return_request_id, sales_order_item_id, product_id, quantity, unit_price,
      exchange_product_id, exchange_unit_price
    ) VALUES (
      v_request.id, v_line.item_id, v_item.product_id, v_line.quantity, v_item.unit_price,
      v_new.id, v_new_price
    );
    v_refund := v_refund + v_item.unit_price * v_line.quantity;
  END LOOP;

  UPDATE public.return_requests SET refund_amount = v_refund WHERE id = v_request.id;

  RETURN jsonb_build_object('return_number', v_request.return_number, 'refund_amount', v_refund);
END;
$$;

REVOKE ALL ON FUNCTION public.create_return_request(TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.create_return_request(TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_return_request: what the customer sees, now with label, deduction and exchange
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_return_request(p_return_number TEXT, p_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_return public.return_requests%ROWTYPE;
BEGIN
  v_return := public.find_own_return(p_return_number, p_email);
  IF v_return.id IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'return_number', v_return.return_number,
    'order_number', (SELECT order_number FROM public.sales_orders WHERE id = v_return.sales_order_id),
    'status', v_return.status,
    'resolution', v_return.resolution,
    'reason', v_return.reason,
    'customer_note', v_return.customer_note,
    'refund_amount', v_return.refund_amount,
    'refund_deduction', v_return.refund_deduction,
    'refunded_amount', v_return.refunded_amount,
    'settlement_amount', v_return.settlement_amount,
    'replacement_order_number',
      (SELECT order_number FROM public.sales_orders WHERE id = v_return.replacement_order_id),
    'customer_message', v_return.customer_message,
    'tracking_number', v_return.tracking_number,
    'has_label', v_return.label_created_at IS NOT NULL,
    'label_carrier', v_return.label_carrier,
    'label_tracking_number', v_return.label_tracking_number,
    'created_at', v_return.created_at,
    'approved_at', v_return.approved_at,
    'received_at', v_return.received_at,
    'refunded_at', v_return.refunded_at,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', p.name, 'quantity', ri.quantity, 'unit_price', ri.unit_price,
        'exchange_name', np.name, 'exchange_unit_price', ri.exchange_unit_price
      ) ORDER BY p.name)
      FROM public.return_items ri
      JOIN public.products p ON p.id = ri.product_id
      LEFT JOIN public.products np ON np.id = ri.exchange_product_id
      WHERE ri.return_request_id = v_return.id
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- complete_exchange: create the replacement order and work out the settlement (staff)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_exchange(p_return_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ret public.return_requests%ROWTYPE;
  v_order public.sales_orders%ROWTYPE;
  v_new_order public.sales_orders%ROWTYPE;
  v_line RECORD;
  v_new_total NUMERIC := 0;
  v_credit NUMERIC;
  v_diff NUMERIC;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  SELECT * INTO v_ret FROM public.return_requests WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF v_ret.resolution <> 'exchange' THEN RAISE EXCEPTION 'This return is a refund, not an exchange'; END IF;
  IF v_ret.status <> 'received' THEN RAISE EXCEPTION 'Mark the parcel as received first'; END IF;
  IF v_ret.replacement_order_id IS NOT NULL THEN RAISE EXCEPTION 'The replacement order already exists'; END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = v_ret.sales_order_id;

  -- Stock for the replacements.
  FOR v_line IN
    SELECT ri.exchange_product_id AS product_id, p.name, p.stock, sum(ri.quantity) AS quantity,
           sum(ri.quantity * ri.exchange_unit_price) AS value
    FROM public.return_items ri JOIN public.products p ON p.id = ri.exchange_product_id
    WHERE ri.return_request_id = v_ret.id
    GROUP BY ri.exchange_product_id, p.name, p.stock
  LOOP
    IF v_line.stock < v_line.quantity THEN
      RAISE EXCEPTION 'Not enough stock for the replacement %', v_line.name;
    END IF;
    v_new_total := v_new_total + v_line.value;
  END LOOP;
  IF v_new_total = 0 THEN RAISE EXCEPTION 'This exchange has no replacement items'; END IF;

  v_credit := v_ret.refund_amount - v_ret.refund_deduction;
  v_diff := round(v_new_total - v_credit, 2);

  INSERT INTO public.sales_orders (
    customer_id, customer_name, customer_email, customer_phone, shipping_address,
    shipping_cost, payment_method, source, language, total, amount_charged
  ) VALUES (
    v_ret.customer_id, v_order.customer_name, v_order.customer_email, v_order.customer_phone,
    v_order.shipping_address, 0, 'exchange', 'exchange', v_order.language,
    v_new_total, greatest(v_diff, 0)
  ) RETURNING * INTO v_new_order;

  INSERT INTO public.sales_order_items (sales_order_id, product_id, quantity, unit_price)
  SELECT v_new_order.id, ri.exchange_product_id, sum(ri.quantity)::INT,
         round(sum(ri.quantity * ri.exchange_unit_price) / sum(ri.quantity), 2)
  FROM public.return_items ri
  WHERE ri.return_request_id = v_ret.id
  GROUP BY ri.exchange_product_id;

  -- Nothing to collect: the replacement is covered, so it can be prepared (and stock reserved) now.
  IF v_diff <= 0 THEN
    UPDATE public.sales_orders SET payment_status = 'paid' WHERE id = v_new_order.id;
  END IF;

  UPDATE public.return_requests
  SET replacement_order_id = v_new_order.id,
      settlement_amount = v_diff,
      -- With a refund to make (v_diff < 0) the return stays "received" until that refund is done.
      status = CASE WHEN v_diff >= 0 THEN 'refunded' ELSE status END,
      refunded_amount = CASE WHEN v_diff >= 0 THEN 0 ELSE refunded_amount END
  WHERE id = v_ret.id;

  RETURN jsonb_build_object(
    'replacement_order_id', v_new_order.id,
    'replacement_order_number', v_new_order.order_number,
    'settlement_amount', v_diff
  );
END;
$$;
REVOKE ALL ON FUNCTION public.complete_exchange(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_exchange(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Customers: refunded returns reduce "total spent" by what was kept back from the customer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.customer_stats WITH (security_invoker = true) AS
SELECT
  c.id AS customer_id,
  COUNT(o.id) AS orders_count,
  COUNT(o.id) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled') AS purchases_count,
  GREATEST(
    COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'), 0)
    - COALESCE((SELECT SUM(r.refund_amount - r.refund_deduction) FROM public.return_requests r
                WHERE lower(r.customer_email) = c.email AND r.status = 'refunded'), 0),
    0
  ) AS total_spent,
  MAX(COALESCE(o.paid_at, o.created_at))
    FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled') AS last_purchase_at,
  (SELECT COUNT(*) FROM public.warranty_tickets t
    WHERE lower(t.customer_email) = c.email AND t.status NOT IN ('resolved', 'closed')) AS open_tickets
FROM public.customers c
LEFT JOIN public.sales_orders o ON lower(o.customer_email) = c.email
GROUP BY c.id;
