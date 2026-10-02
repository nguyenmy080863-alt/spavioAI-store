-- Returns: customers (logged in or guests) start a return within the trial window; admins approve,
-- receive and refund it.
--
--   status flow   requested -> approved -> received -> refunded
--                 requested -> rejected | cancelled      approved -> cancelled
--
-- Rules enforced here (not in the browser):
--   * the order must match order number + email, be paid and not cancelled
--   * only delivered items can be returned, within return_window_days() of their delivery
--   * an item can only be returned once (rejected and cancelled requests free it again)
--   * the customer must confirm the device is complete and in its original packaging
--
-- Guests have no account, so they use SECURITY DEFINER functions guarded by order number + email
-- (get_returnable_items, create_return_request) and return number + email (get_return_request,
-- add_return_tracking, cancel_return_request). Staff use the tables directly under RLS.
--
-- Refunds are made by hand in PayPal; staff then record them here. Safe to run more than once.

CREATE SEQUENCE IF NOT EXISTS public.return_seq START 1;

-- Single place for the trial length. The storefront shows the same number (src/lib/returns.ts).
CREATE OR REPLACE FUNCTION public.return_window_days() RETURNS INT
LANGUAGE sql IMMUTABLE AS $$ SELECT 30 $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number TEXT NOT NULL UNIQUE DEFAULT 'RT-' || lpad(nextval('public.return_seq')::text, 5, '0'),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'received', 'refunded', 'rejected', 'cancelled')),
  reason TEXT NOT NULL CHECK (reason IN ('changed_mind', 'not_suitable', 'defective', 'wrong_item', 'other')),
  customer_note TEXT NOT NULL DEFAULT '',
  condition_confirmed BOOLEAN NOT NULL DEFAULT false,
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL,
  -- Value of the returned items. Staff can change it before refunding (for example for a
  -- preorder whose balance was never charged, or a deduction for a damaged device).
  refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  refund_reference TEXT NOT NULL DEFAULT '',
  -- Shown to the customer: return instructions, or the reason for a rejection.
  customer_message TEXT NOT NULL DEFAULT '',
  -- Team only.
  internal_note TEXT NOT NULL DEFAULT '',
  -- Tracking number of the customer's return parcel.
  tracking_number TEXT NOT NULL DEFAULT '',
  approved_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  restocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS return_requests_order_idx ON public.return_requests (sales_order_id);
CREATE INDEX IF NOT EXISTS return_requests_customer_idx ON public.return_requests (customer_id);
CREATE INDEX IF NOT EXISTS return_requests_email_idx ON public.return_requests (lower(customer_email));
CREATE INDEX IF NOT EXISTS return_requests_status_idx ON public.return_requests (status);

CREATE TABLE IF NOT EXISTS public.return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  sales_order_item_id UUID NOT NULL REFERENCES public.sales_order_items(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  UNIQUE (return_request_id, sales_order_item_id)
);

-- ---------------------------------------------------------------------------
-- Status rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_request_before_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
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
    IF NEW.status = 'approved' THEN NEW.approved_at := now(); END IF;
    IF NEW.status = 'received' THEN NEW.received_at := now(); END IF;
    IF NEW.status = 'refunded' THEN NEW.refunded_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS return_requests_before_update ON public.return_requests;
CREATE TRIGGER return_requests_before_update BEFORE UPDATE ON public.return_requests
FOR EACH ROW EXECUTE FUNCTION public.return_request_before_update();

-- ---------------------------------------------------------------------------
-- What can still be returned for an order (internal helper)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_returnable_items(p_order_id UUID)
RETURNS TABLE (
  sales_order_item_id UUID,
  product_id UUID,
  name TEXT,
  slug TEXT,
  unit_price NUMERIC,
  quantity_returnable INT,
  delivered_at TIMESTAMPTZ,
  window_ends_at TIMESTAMPTZ,
  in_window BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    soi.id,
    soi.product_id,
    p.name,
    p.slug,
    soi.unit_price,
    GREATEST(COALESCE(dl.qty, 0) - COALESCE(rq.qty, 0), 0)::INT,
    dl.dt,
    dl.dt + make_interval(days => public.return_window_days()),
    dl.dt IS NOT NULL AND now() <= dl.dt + make_interval(days => public.return_window_days())
  FROM public.sales_order_items soi
  JOIN public.products p ON p.id = soi.product_id
  LEFT JOIN LATERAL (
    SELECT sum(di.quantity) AS qty, max(d.delivered_at) AS dt
    FROM public.delivery_order_items di
    JOIN public.delivery_orders d ON d.id = di.delivery_order_id
    WHERE di.sales_order_item_id = soi.id AND d.status = 'delivered'
  ) dl ON true
  LEFT JOIN LATERAL (
    SELECT sum(ri.quantity) AS qty
    FROM public.return_items ri
    JOIN public.return_requests r ON r.id = ri.return_request_id
    WHERE ri.sales_order_item_id = soi.id AND r.status NOT IN ('rejected', 'cancelled')
  ) rq ON true
  WHERE soi.sales_order_id = p_order_id
$$;
REVOKE ALL ON FUNCTION public.order_returnable_items(UUID) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Customer / guest functions
-- ---------------------------------------------------------------------------
-- Step 1 of the form: which items of this order can be returned?
CREATE OR REPLACE FUNCTION public.get_returnable_items(p_order_number TEXT, p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_blocked TEXT;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders
  WHERE upper(order_number) = upper(trim(COALESCE(p_order_number, '')))
    AND customer_email <> '' AND lower(customer_email) = lower(trim(COALESCE(p_email, '')));
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_blocked := CASE
    WHEN v_order.status = 'cancelled' THEN 'cancelled'
    WHEN v_order.payment_status <> 'paid' THEN 'unpaid'
    ELSE NULL END;

  RETURN jsonb_build_object(
    'order_number', v_order.order_number,
    'blocked', v_blocked,
    'window_days', public.return_window_days(),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sales_order_item_id', i.sales_order_item_id,
        'name', i.name,
        'unit_price', i.unit_price,
        'quantity_returnable', i.quantity_returnable,
        'delivered_at', i.delivered_at,
        'window_ends_at', i.window_ends_at,
        'in_window', i.in_window
      ) ORDER BY i.name)
      FROM public.order_returnable_items(v_order.id) i
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_return_request(
  p_order_number TEXT,
  p_email TEXT,
  p_reason TEXT,
  p_note TEXT,
  p_items JSONB,
  p_condition_confirmed BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_order public.sales_orders%ROWTYPE;
  v_request public.return_requests%ROWTYPE;
  v_line RECORD;
  v_item RECORD;
  v_refund NUMERIC := 0;
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

  -- Light spam guard: at most 5 return requests per email per day.
  IF (SELECT count(*) FROM public.return_requests
      WHERE lower(customer_email) = v_email AND created_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'Too many return requests today. Please contact support.';
  END IF;

  INSERT INTO public.return_requests (
    sales_order_id, reason, customer_note, condition_confirmed, customer_id,
    customer_name, customer_email
  ) VALUES (
    v_order.id, p_reason, trim(COALESCE(p_note, '')), true, auth.uid(),
    v_order.customer_name, v_order.customer_email
  ) RETURNING * INTO v_request;

  FOR v_line IN
    SELECT x.sales_order_item_id AS item_id, sum(x.quantity)::INT AS quantity
    FROM jsonb_to_recordset(p_items) AS x(sales_order_item_id UUID, quantity INT)
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

    INSERT INTO public.return_items (return_request_id, sales_order_item_id, product_id, quantity, unit_price)
    VALUES (v_request.id, v_line.item_id, v_item.product_id, v_line.quantity, v_item.unit_price);
    v_refund := v_refund + v_item.unit_price * v_line.quantity;
  END LOOP;

  UPDATE public.return_requests SET refund_amount = v_refund WHERE id = v_request.id;

  RETURN jsonb_build_object('return_number', v_request.return_number, 'refund_amount', v_refund);
END;
$$;

-- Shared check: the caller owns the return (signed in) or knows return number + email.
CREATE OR REPLACE FUNCTION public.find_own_return(p_return_number TEXT, p_email TEXT)
RETURNS public.return_requests
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_return public.return_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_return FROM public.return_requests
  WHERE return_number = upper(trim(COALESCE(p_return_number, '')));
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF (auth.uid() IS NOT NULL AND v_return.customer_id = auth.uid())
     OR lower(v_return.customer_email) = lower(trim(COALESCE(p_email, ''))) THEN
    RETURN v_return;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.find_own_return(TEXT, TEXT) FROM public, anon, authenticated;

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
    'reason', v_return.reason,
    'customer_note', v_return.customer_note,
    'refund_amount', v_return.refund_amount,
    'customer_message', v_return.customer_message,
    'tracking_number', v_return.tracking_number,
    'created_at', v_return.created_at,
    'approved_at', v_return.approved_at,
    'received_at', v_return.received_at,
    'refunded_at', v_return.refunded_at,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', p.name, 'quantity', ri.quantity, 'unit_price', ri.unit_price)
                       ORDER BY p.name)
      FROM public.return_items ri JOIN public.products p ON p.id = ri.product_id
      WHERE ri.return_request_id = v_return.id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_return_tracking(p_return_number TEXT, p_email TEXT, p_tracking TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_return public.return_requests%ROWTYPE;
BEGIN
  v_return := public.find_own_return(p_return_number, p_email);
  IF v_return.id IS NULL THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF v_return.status NOT IN ('requested', 'approved') THEN
    RAISE EXCEPTION 'The tracking number can no longer be changed';
  END IF;
  UPDATE public.return_requests SET tracking_number = left(trim(COALESCE(p_tracking, '')), 80)
  WHERE id = v_return.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_return_request(p_return_number TEXT, p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_return public.return_requests%ROWTYPE;
BEGIN
  v_return := public.find_own_return(p_return_number, p_email);
  IF v_return.id IS NULL THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF v_return.status <> 'requested' THEN
    RAISE EXCEPTION 'Only a return that has not been approved yet can be cancelled. Please contact support.';
  END IF;
  UPDATE public.return_requests SET status = 'cancelled' WHERE id = v_return.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_returnable_items(TEXT, TEXT) FROM public;
REVOKE ALL ON FUNCTION public.create_return_request(TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) FROM public;
REVOKE ALL ON FUNCTION public.get_return_request(TEXT, TEXT) FROM public;
REVOKE ALL ON FUNCTION public.add_return_tracking(TEXT, TEXT, TEXT) FROM public;
REVOKE ALL ON FUNCTION public.cancel_return_request(TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.get_returnable_items(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_return_request(TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_return_request(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_return_tracking(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_return_request(TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- The order pages show returns and whether a return can still be started
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
-- Customers: refunded returns reduce "total spent"; anonymising also wipes return contact data
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.customer_stats WITH (security_invoker = true) AS
SELECT
  c.id AS customer_id,
  COUNT(o.id) AS orders_count,
  COUNT(o.id) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled') AS purchases_count,
  GREATEST(
    COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'), 0)
    - COALESCE((SELECT SUM(r.refund_amount) FROM public.return_requests r
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

  UPDATE public.return_requests
  SET customer_name = 'Anonymised', customer_email = 'anonymised-' || id || '@anonymised.invalid',
      customer_id = NULL, customer_note = ''
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

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_requests, public.return_items TO authenticated;
GRANT ALL ON public.return_requests, public.return_items TO service_role;
GRANT USAGE ON SEQUENCE public.return_seq TO authenticated, service_role;

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff or owner read returns" ON public.return_requests;
CREATE POLICY "Staff or owner read returns" ON public.return_requests
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR customer_id = auth.uid());
DROP POLICY IF EXISTS "Staff update returns" ON public.return_requests;
CREATE POLICY "Staff update returns" ON public.return_requests
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Admins delete returns" ON public.return_requests;
CREATE POLICY "Admins delete returns" ON public.return_requests
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff or owner read return items" ON public.return_items;
CREATE POLICY "Staff or owner read return items" ON public.return_items
  FOR SELECT TO authenticated USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.return_requests r WHERE r.id = return_request_id AND r.customer_id = auth.uid())
  );
DROP POLICY IF EXISTS "Admins delete return items" ON public.return_items;
CREATE POLICY "Admins delete return items" ON public.return_items
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
