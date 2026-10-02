-- Analytics: one function for the period report (dashboard and Reports page) and one for the live
-- monitor. Read-only. Any team member can read them (is_staff); both functions check this themselves.
--
-- Rules shared with Finance:
--   a sale is a paid order that is not cancelled, dated by paid_at (created_at if missing)
--   gross = list price x quantity, discounts = what discounts took off, returns = value of returns
--   marked refunded in the period, net sales = gross - discounts - returns
--   product revenue = unit_price x quantity (already after discounts)
--
-- Customers: "new" = the customer's first ever paid order falls inside the period; "returning" =
-- they had paid before the period. Matched by email, so guests count too. Orders without an email
-- (typed in by hand) are left out of the customer figures.
--
-- Not available yet (no visitor tracking): sessions, conversion rate, traffic sources, cart events.
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.analytics_paid_orders(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS SETOF public.sales_orders
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.sales_orders o
  WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'
    AND COALESCE(o.paid_at, o.created_at) BETWEEN p_from AND p_to
$$;
REVOKE ALL ON FUNCTION public.analytics_paid_orders(TIMESTAMPTZ, TIMESTAMPTZ) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.analytics_report(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_tz TEXT DEFAULT 'UTC',
  p_granularity TEXT DEFAULT 'day'
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_unit TEXT := CASE WHEN p_granularity IN ('day', 'week', 'month') THEN p_granularity ELSE 'day' END;
  v_summary RECORD;
  v_returns RECORD;
  v_series JSONB;
  v_top JSONB;
  v_unsold JSONB;
  v_unsold_count INT;
  v_categories JSONB;
  v_customers RECORD;
  v_account RECORD;
  v_discounts JSONB;
  v_discount_orders INT;
  v_return_requests RECORD;
  v_reasons JSONB;
  v_countries JSONB;
  v_cities JSONB;
  v_payments JSONB;
  v_tickets RECORD;
  v_ticket_types JSONB;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Invalid period'; END IF;
  -- Keep the series short enough to chart.
  IF v_unit = 'day' AND p_to - p_from > interval '400 days' THEN v_unit := 'month'; END IF;

  -- Summary
  SELECT count(*) AS orders,
         COALESCE(sum(o.discount_amount), 0) AS discounts,
         COALESCE(sum(o.total), 0) AS revenue,
         COALESCE(sum((SELECT sum(COALESCE(i.list_unit_price, i.unit_price) * i.quantity)
                       FROM public.sales_order_items i WHERE i.sales_order_id = o.id)), 0) AS gross,
         COALESCE(sum((SELECT sum(i.unit_price * i.quantity)
                       FROM public.sales_order_items i WHERE i.sales_order_id = o.id)), 0) AS net_items
  INTO v_summary
  FROM public.analytics_paid_orders(p_from, p_to) o;

  SELECT count(*) AS n,
         COALESCE(sum(r.refund_amount - r.refund_deduction), 0) AS val
  INTO v_returns
  FROM public.return_requests r
  WHERE r.status = 'refunded' AND r.refunded_at BETWEEN p_from AND p_to;

  -- Sales over time
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'period', to_char(s.p, 'YYYY-MM-DD'),
           'orders', s.orders, 'gross', s.gross, 'discounts', s.discounts, 'returns', s.returns,
           'net', s.gross - s.discounts - s.returns) ORDER BY s.p), '[]'::jsonb)
  INTO v_series
  FROM (
    SELECT g.p,
           COALESCE(a.orders, 0) AS orders, COALESCE(a.gross, 0) AS gross,
           COALESCE(a.discounts, 0) AS discounts, COALESCE(r.val, 0) AS returns
    FROM generate_series(
           date_trunc(v_unit, p_from AT TIME ZONE p_tz),
           date_trunc(v_unit, p_to AT TIME ZONE p_tz),
           ('1 ' || v_unit)::INTERVAL) AS g(p)
    LEFT JOIN (
      SELECT date_trunc(v_unit, COALESCE(o.paid_at, o.created_at) AT TIME ZONE p_tz) AS p,
             count(*) AS orders,
             sum(o.discount_amount) AS discounts,
             sum((SELECT sum(COALESCE(i.list_unit_price, i.unit_price) * i.quantity)
                  FROM public.sales_order_items i WHERE i.sales_order_id = o.id)) AS gross
      FROM public.analytics_paid_orders(p_from, p_to) o
      GROUP BY 1
    ) a ON a.p = g.p
    LEFT JOIN (
      SELECT date_trunc(v_unit, r.refunded_at AT TIME ZONE p_tz) AS p,
             sum(r.refund_amount - r.refund_deduction) AS val
      FROM public.return_requests r
      WHERE r.status = 'refunded' AND r.refunded_at BETWEEN p_from AND p_to
      GROUP BY 1
    ) r ON r.p = g.p
  ) s;

  -- Products
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', t.name, 'category', t.category, 'units', t.units, 'revenue', t.revenue) ORDER BY t.revenue DESC), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT p.name, p.category, sum(i.quantity) AS units, sum(i.unit_price * i.quantity) AS revenue
    FROM public.analytics_paid_orders(p_from, p_to) o
    JOIN public.sales_order_items i ON i.sales_order_id = o.id
    JOIN public.products p ON p.id = i.product_id
    GROUP BY p.id, p.name, p.category
    ORDER BY revenue DESC LIMIT 10
  ) t;

  SELECT count(*), COALESCE(jsonb_agg(u.name) FILTER (WHERE u.rn <= 10), '[]'::jsonb)
  INTO v_unsold_count, v_unsold
  FROM (
    SELECT p.name, row_number() OVER (ORDER BY p.name) AS rn
    FROM public.products p
    WHERE p.status = 'published' AND p.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.sales_order_items i
        JOIN public.analytics_paid_orders(p_from, p_to) o ON o.id = i.sales_order_id
        WHERE i.product_id = p.id)
  ) u;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'category', t.category, 'units', t.units, 'revenue', t.revenue) ORDER BY t.revenue DESC), '[]'::jsonb)
  INTO v_categories
  FROM (
    SELECT p.category, sum(i.quantity) AS units, sum(i.unit_price * i.quantity) AS revenue
    FROM public.analytics_paid_orders(p_from, p_to) o
    JOIN public.sales_order_items i ON i.sales_order_id = o.id
    JOIN public.products p ON p.id = i.product_id
    GROUP BY p.category
  ) t;

  -- Customers: new vs returning (by email)
  WITH first_paid AS (
    SELECT lower(customer_email) AS email, min(COALESCE(paid_at, created_at)) AS first_at
    FROM public.sales_orders
    WHERE payment_status = 'paid' AND status <> 'cancelled' AND customer_email <> ''
    GROUP BY 1
  ), period AS (
    SELECT lower(o.customer_email) AS email, o.total, (f.first_at >= p_from) AS is_new
    FROM public.analytics_paid_orders(p_from, p_to) o
    JOIN first_paid f ON f.email = lower(o.customer_email)
    WHERE o.customer_email <> ''
  )
  SELECT count(DISTINCT email) AS customers,
         count(DISTINCT email) FILTER (WHERE is_new) AS new_customers,
         count(DISTINCT email) FILTER (WHERE NOT is_new) AS returning_customers,
         count(*) FILTER (WHERE is_new) AS new_orders,
         count(*) FILTER (WHERE NOT is_new) AS returning_orders,
         COALESCE(sum(total) FILTER (WHERE is_new), 0) AS new_revenue,
         COALESCE(sum(total) FILTER (WHERE NOT is_new), 0) AS returning_revenue
  INTO v_customers
  FROM period;

  SELECT count(*) FILTER (WHERE o.customer_id IS NOT NULL) AS account_orders,
         count(*) FILTER (WHERE o.customer_id IS NULL) AS guest_orders,
         COALESCE(sum(o.total) FILTER (WHERE o.customer_id IS NOT NULL), 0) AS account_revenue,
         COALESCE(sum(o.total) FILTER (WHERE o.customer_id IS NULL), 0) AS guest_revenue
  INTO v_account
  FROM public.analytics_paid_orders(p_from, p_to) o;

  -- Discounts used on orders paid in the period
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', t.name, 'code', t.code, 'type', t.type, 'uses', t.uses,
           'amount_given', t.amount_given, 'revenue', t.revenue) ORDER BY t.amount_given DESC), '[]'::jsonb)
  INTO v_discounts
  FROM (
    SELECT d.name, d.code, d.type, count(*) AS uses,
           COALESCE(sum(r.amount), 0) AS amount_given, COALESCE(sum(o.total), 0) AS revenue
    FROM public.discount_redemptions r
    JOIN public.discounts d ON d.id = r.discount_id
    JOIN public.analytics_paid_orders(p_from, p_to) o ON o.id = r.sales_order_id
    GROUP BY d.id, d.name, d.code, d.type
  ) t;

  SELECT count(*) INTO v_discount_orders
  FROM public.analytics_paid_orders(p_from, p_to) o
  WHERE o.discount_amount > 0 OR o.shipping_discount > 0;

  -- Returns requested in the period
  SELECT count(*) AS requested,
         count(*) FILTER (WHERE r.resolution = 'exchange') AS exchanges,
         count(*) FILTER (WHERE r.status = 'refunded') AS completed,
         avg(EXTRACT(EPOCH FROM (r.refunded_at - r.created_at)) / 86400)
           FILTER (WHERE r.status = 'refunded') AS avg_days
  INTO v_return_requests
  FROM public.return_requests r
  WHERE r.created_at BETWEEN p_from AND p_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', t.reason, 'count', t.n) ORDER BY t.n DESC), '[]'::jsonb)
  INTO v_reasons
  FROM (
    SELECT r.reason, count(*) AS n FROM public.return_requests r
    WHERE r.created_at BETWEEN p_from AND p_to GROUP BY r.reason
  ) t;

  -- Where orders go and how they are paid
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'country', t.country, 'orders', t.orders, 'revenue', t.revenue) ORDER BY t.revenue DESC), '[]'::jsonb)
  INTO v_countries
  FROM (
    SELECT COALESCE(NULLIF(trim(o.shipping_address ->> 'country'), ''), 'Unknown') AS country,
           count(*) AS orders, sum(o.total) AS revenue
    FROM public.analytics_paid_orders(p_from, p_to) o
    GROUP BY 1 ORDER BY revenue DESC LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'city', t.city, 'country', t.country, 'orders', t.orders, 'revenue', t.revenue) ORDER BY t.revenue DESC), '[]'::jsonb)
  INTO v_cities
  FROM (
    SELECT COALESCE(NULLIF(trim(o.shipping_address ->> 'city'), ''), 'Unknown') AS city,
           COALESCE(NULLIF(trim(o.shipping_address ->> 'country'), ''), 'Unknown') AS country,
           count(*) AS orders, sum(o.total) AS revenue
    FROM public.analytics_paid_orders(p_from, p_to) o
    GROUP BY 1, 2 ORDER BY revenue DESC LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'method', t.method, 'orders', t.orders, 'revenue', t.revenue) ORDER BY t.revenue DESC), '[]'::jsonb)
  INTO v_payments
  FROM (
    SELECT COALESCE(NULLIF(o.payment_method, ''), 'manual') AS method, count(*) AS orders, sum(o.total) AS revenue
    FROM public.analytics_paid_orders(p_from, p_to) o GROUP BY 1
  ) t;

  -- Warranty and support
  SELECT count(*) AS opened,
         count(*) FILTER (WHERE t.status IN ('resolved', 'closed')) AS resolved,
         avg(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 86400) FILTER (WHERE t.resolved_at IS NOT NULL) AS avg_days
  INTO v_tickets
  FROM public.warranty_tickets t
  WHERE t.created_at BETWEEN p_from AND p_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('type', t.type, 'count', t.n) ORDER BY t.n DESC), '[]'::jsonb)
  INTO v_ticket_types
  FROM (
    SELECT w.type, count(*) AS n FROM public.warranty_tickets w
    WHERE w.created_at BETWEEN p_from AND p_to GROUP BY w.type
  ) t;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'granularity', v_unit),
    'summary', jsonb_build_object(
      'orders', v_summary.orders,
      'gross_sales', v_summary.gross,
      'discounts', v_summary.discounts,
      'returns_value', v_returns.val,
      'returns_completed', v_returns.n,
      'net_sales', v_summary.gross - v_summary.discounts - v_returns.val,
      'average_order_value', CASE WHEN v_summary.orders > 0 THEN round(v_summary.net_items / v_summary.orders, 2) ELSE 0 END,
      'revenue_collected', v_summary.revenue
    ),
    'sales_over_time', v_series,
    'products', jsonb_build_object('top', v_top, 'unsold_count', v_unsold_count, 'unsold', v_unsold),
    'categories', v_categories,
    'customers', jsonb_build_object(
      'customers', v_customers.customers,
      'new_customers', v_customers.new_customers,
      'returning_customers', v_customers.returning_customers,
      'repeat_rate', CASE WHEN v_customers.customers > 0
                          THEN round(v_customers.returning_customers::NUMERIC / v_customers.customers * 100, 1) ELSE 0 END,
      'new_orders', v_customers.new_orders,
      'returning_orders', v_customers.returning_orders,
      'new_revenue', v_customers.new_revenue,
      'returning_revenue', v_customers.returning_revenue,
      'account_orders', v_account.account_orders,
      'guest_orders', v_account.guest_orders,
      'account_revenue', v_account.account_revenue,
      'guest_revenue', v_account.guest_revenue
    ),
    'discounts', jsonb_build_object(
      'by_discount', v_discounts,
      'orders_with_discount', v_discount_orders,
      'share_of_orders', CASE WHEN v_summary.orders > 0
                              THEN round(v_discount_orders::NUMERIC / v_summary.orders * 100, 1) ELSE 0 END
    ),
    'returns', jsonb_build_object(
      'requested', v_return_requests.requested,
      'exchanges', v_return_requests.exchanges,
      'completed', v_return_requests.completed,
      'avg_days_to_refund', round(COALESCE(v_return_requests.avg_days, 0)::NUMERIC, 1),
      'return_rate', CASE WHEN v_summary.orders > 0
                          THEN round(v_return_requests.requested::NUMERIC / v_summary.orders * 100, 1) ELSE 0 END,
      'reasons', v_reasons
    ),
    'geography', jsonb_build_object('countries', v_countries, 'cities', v_cities),
    'payment_methods', v_payments,
    'warranty', jsonb_build_object(
      'opened', v_tickets.opened,
      'resolved', v_tickets.resolved,
      'avg_days_to_resolve', round(COALESCE(v_tickets.avg_days, 0)::NUMERIC, 1),
      'by_type', v_ticket_types
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_report(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.analytics_report(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

-- Live monitor: today so far, compared with yesterday, plus what needs attention right now.
CREATE OR REPLACE FUNCTION public.analytics_live(p_day_start TIMESTAMPTZ, p_tz TEXT DEFAULT 'UTC')
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_today RECORD;
  v_same_time RECORD;
  v_yesterday RECORD;
  v_created RECORD;
  v_hour RECORD;
  v_hourly JSONB;
  v_recent JSONB;
  v_counts RECORD;
  v_stock RECORD;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_day_start IS NULL OR p_day_start > v_now THEN RAISE EXCEPTION 'Invalid day start'; END IF;

  SELECT count(*) AS orders, COALESCE(sum(o.total), 0) AS revenue
  INTO v_today
  FROM public.analytics_paid_orders(p_day_start, v_now) o;

  -- Yesterday up to the same time of day, for a fair comparison.
  SELECT count(*) AS orders, COALESCE(sum(o.total), 0) AS revenue
  INTO v_same_time
  FROM public.analytics_paid_orders(p_day_start - interval '1 day', v_now - interval '1 day') o;

  SELECT count(*) AS orders, COALESCE(sum(o.total), 0) AS revenue
  INTO v_yesterday
  FROM public.analytics_paid_orders(p_day_start - interval '1 day', p_day_start - interval '1 second') o;

  -- Orders placed (paid or not) today and in the last hour.
  SELECT count(*) FILTER (WHERE o.created_at >= p_day_start) AS today,
         count(*) FILTER (WHERE o.created_at >= v_now - interval '1 hour') AS last_hour
  INTO v_created
  FROM public.sales_orders o
  WHERE o.status <> 'cancelled' AND o.created_at >= LEAST(p_day_start, v_now - interval '1 hour');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', h.hr, 'orders', COALESCE(a.orders, 0), 'revenue', COALESCE(a.revenue, 0))
                            ORDER BY h.hr), '[]'::jsonb)
  INTO v_hourly
  FROM generate_series(0, 23) AS h(hr)
  LEFT JOIN (
    SELECT extract(hour FROM COALESCE(o.paid_at, o.created_at) AT TIME ZONE p_tz)::INT AS hr,
           count(*) AS orders, sum(o.total) AS revenue
    FROM public.analytics_paid_orders(p_day_start, v_now) o
    GROUP BY 1
  ) a ON a.hr = h.hr;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'order_number', t.order_number, 'customer', t.customer_name,
           'total', t.total, 'status', t.status, 'payment_status', t.payment_status,
           'source', t.source, 'created_at', t.created_at) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT o.id, o.order_number, o.customer_name, o.total, o.status, o.payment_status, o.source, o.created_at
    FROM public.sales_orders o ORDER BY o.created_at DESC LIMIT 10
  ) t;

  SELECT
    (SELECT count(*) FROM public.sales_orders o WHERE o.source = 'checkout' AND o.status = 'open'
       AND o.payment_status = 'unpaid' AND o.payment_reported_at IS NOT NULL) AS payments_to_confirm,
    (SELECT count(*) FROM public.warranty_tickets t WHERE t.status = 'open') AS new_tickets,
    (SELECT count(*) FROM public.warranty_tickets t
       WHERE t.status IN ('open', 'in_review', 'awaiting_customer', 'visit_scheduled')) AS open_tickets,
    (SELECT count(*) FROM public.return_requests r WHERE r.status = 'requested') AS returns_to_review,
    (SELECT count(*) FROM public.return_requests r WHERE r.status = 'received') AS refunds_waiting,
    (SELECT count(*) FROM public.delivery_orders d WHERE d.status = 'preparing') AS deliveries_to_hand_over
  INTO v_counts;

  SELECT count(*) FILTER (WHERE p.stock = 0) AS out_of_stock,
         count(*) FILTER (WHERE p.stock > 0 AND p.stock <= p.low_stock_threshold) AS low_stock
  INTO v_stock
  FROM public.products p
  WHERE p.status = 'published' AND p.archived_at IS NULL;

  RETURN jsonb_build_object(
    'as_of', v_now,
    'today', jsonb_build_object('orders', v_today.orders, 'revenue', v_today.revenue,
      'average_order_value', CASE WHEN v_today.orders > 0 THEN round(v_today.revenue / v_today.orders, 2) ELSE 0 END,
      'orders_placed', v_created.today),
    'yesterday_same_time', jsonb_build_object('orders', v_same_time.orders, 'revenue', v_same_time.revenue),
    'yesterday', jsonb_build_object('orders', v_yesterday.orders, 'revenue', v_yesterday.revenue),
    'last_hour_orders_placed', v_created.last_hour,
    'hourly', v_hourly,
    'recent_orders', v_recent,
    'attention', jsonb_build_object(
      'payments_to_confirm', v_counts.payments_to_confirm,
      'new_tickets', v_counts.new_tickets,
      'open_tickets', v_counts.open_tickets,
      'returns_to_review', v_counts.returns_to_review,
      'refunds_waiting', v_counts.refunds_waiting,
      'deliveries_to_hand_over', v_counts.deliveries_to_hand_over,
      'out_of_stock', v_stock.out_of_stock,
      'low_stock', v_stock.low_stock
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_live(TIMESTAMPTZ, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.analytics_live(TIMESTAMPTZ, TEXT) TO authenticated;
