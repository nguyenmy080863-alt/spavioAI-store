-- Finance: an overview for a period, a "money to check" list and a transaction export for the
-- accountant. Read-only: nothing here changes orders or money.
--
-- Who may see it: Super Admin and Order Processor (can_view_finance). Both functions check this
-- themselves, so the numbers are not readable through any other route.
--
-- Definitions (all amounts include VAT; the store does not calculate VAT):
--   sale             a paid order that is not cancelled, dated by paid_at
--   gross sales      list price x quantity of the items in those orders
--   discounts        what discounts took off the items
--   returns          value of returned items, for returns marked refunded in the period
--                    (items value minus the label deduction we kept)
--   net sales        gross sales - discounts - returns
--   collected        what customers paid at checkout (items or preorder deposits, plus shipping)
--   cash refunded    what was actually paid back (PayPal refund)
--   cost estimate    items sold x the average supplier cost from purchase orders (ordered or received).
--                    Products without a purchase order cost are left out of the margin.
--
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.can_view_finance(_user_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin', 'order_processor')
  )
$$;
REVOKE ALL ON FUNCTION public.can_view_finance(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_view_finance(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_summary(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_orders RECORD;
  v_items RECORD;
  v_returns RECORD;
  v_labels RECORD;
  v_cost RECORD;
  v_unconfirmed RECORD;
  v_refunds_waiting RECORD;
  v_exchange_owed RECORD;
  v_balances RECORD;
  v_suppliers RECORD;
  v_gross NUMERIC;
  v_net_items NUMERIC;
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'Only Super Admins and Order Processors can see Finance'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Invalid period'; END IF;

  -- Orders paid in the period.
  SELECT count(*) AS n,
         COALESCE(sum(o.discount_amount), 0) AS discounts,
         COALESCE(sum(o.shipping_cost), 0) AS shipping,
         COALESCE(sum(o.amount_charged), 0) AS collected
  INTO v_orders
  FROM public.sales_orders o
  WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'
    AND COALESCE(o.paid_at, o.created_at) BETWEEN p_from AND p_to;

  SELECT COALESCE(sum(COALESCE(i.list_unit_price, i.unit_price) * i.quantity), 0) AS gross,
         COALESCE(sum(i.unit_price * i.quantity), 0) AS net_items
  INTO v_items
  FROM public.sales_order_items i
  JOIN public.sales_orders o ON o.id = i.sales_order_id
  WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'
    AND COALESCE(o.paid_at, o.created_at) BETWEEN p_from AND p_to;

  v_gross := v_items.gross;
  v_net_items := v_items.net_items;

  -- Returns finished in the period.
  SELECT count(*) AS n,
         COALESCE(sum(r.refund_amount - r.refund_deduction), 0) AS val,
         COALESCE(sum(r.refund_deduction), 0) AS deductions,
         COALESCE(sum(COALESCE(r.refunded_amount, 0)), 0) AS cash_refunded
  INTO v_returns
  FROM public.return_requests r
  WHERE r.status = 'refunded' AND r.refunded_at BETWEEN p_from AND p_to;

  -- Prepaid return labels we paid for in the period.
  SELECT count(*) AS n, COALESCE(sum(r.label_cost), 0) AS cost
  INTO v_labels
  FROM public.return_requests r
  WHERE r.label_created_at BETWEEN p_from AND p_to;

  -- Rough cost of goods: average supplier cost per product from purchase orders.
  WITH cost AS (
    SELECT poi.product_id,
           sum(poi.unit_cost * CASE WHEN poi.quantity_received > 0 THEN poi.quantity_received ELSE poi.quantity_ordered END)
             / NULLIF(sum(CASE WHEN poi.quantity_received > 0 THEN poi.quantity_received ELSE poi.quantity_ordered END), 0)
             AS avg_cost
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
    WHERE po.status IN ('ordered', 'partially_received', 'received') AND poi.unit_cost > 0
    GROUP BY poi.product_id
  )
  SELECT COALESCE(sum(i.quantity), 0) AS units,
         COALESCE(sum(i.quantity) FILTER (WHERE c.avg_cost IS NOT NULL), 0) AS units_with_cost,
         COALESCE(sum(i.unit_price * i.quantity) FILTER (WHERE c.avg_cost IS NOT NULL), 0) AS revenue_covered,
         COALESCE(sum(c.avg_cost * i.quantity), 0) AS cogs
  INTO v_cost
  FROM public.sales_order_items i
  JOIN public.sales_orders o ON o.id = i.sales_order_id
  LEFT JOIN cost c ON c.product_id = i.product_id
  WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'
    AND COALESCE(o.paid_at, o.created_at) BETWEEN p_from AND p_to;

  -- Money to check (as of now, not tied to the period).
  SELECT count(*) AS n, COALESCE(sum(o.amount_charged), 0) AS amount
  INTO v_unconfirmed
  FROM public.sales_orders o
  WHERE o.source = 'checkout' AND o.status = 'open' AND o.payment_status = 'unpaid' AND o.payment_reported_at IS NOT NULL;

  SELECT count(*) AS n,
         COALESCE(sum(CASE WHEN r.resolution = 'exchange'
                           THEN GREATEST(-r.settlement_amount, 0)
                           ELSE GREATEST(r.refund_amount - r.refund_deduction, 0) END), 0) AS amount
  INTO v_refunds_waiting
  FROM public.return_requests r
  WHERE r.status = 'received';

  SELECT count(*) AS n, COALESCE(sum(o.amount_charged), 0) AS amount
  INTO v_exchange_owed
  FROM public.sales_orders o
  WHERE o.source = 'exchange' AND o.status = 'open' AND o.payment_status = 'unpaid' AND o.amount_charged > 0;

  SELECT count(*) AS n, COALESCE(sum(o.balance_due), 0) AS amount
  INTO v_balances
  FROM public.sales_orders o
  WHERE o.payment_status = 'paid' AND o.status = 'open' AND o.balance_due > 0;

  SELECT count(DISTINCT po.id) AS n,
         COALESCE(sum((poi.quantity_ordered - poi.quantity_received) * poi.unit_cost), 0) AS amount
  INTO v_suppliers
  FROM public.purchase_orders po
  JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
  WHERE po.status IN ('ordered', 'partially_received');

  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'orders', v_orders.n,
    'gross_sales', v_gross,
    'discounts', v_orders.discounts,
    'returns_value', v_returns.val,
    'returns_count', v_returns.n,
    'net_sales', v_gross - v_orders.discounts - v_returns.val,
    'average_order_value', CASE WHEN v_orders.n > 0 THEN round(v_net_items / v_orders.n, 2) ELSE 0 END,
    'shipping_charged', v_orders.shipping,
    'collected', v_orders.collected,
    'cash_refunded', v_returns.cash_refunded,
    'return_deductions_kept', v_returns.deductions,
    'return_labels', jsonb_build_object('count', v_labels.n, 'cost', v_labels.cost),
    'cost_estimate', jsonb_build_object(
      'units', v_cost.units,
      'units_with_cost', v_cost.units_with_cost,
      'cogs', round(v_cost.cogs, 2),
      'revenue_covered', v_cost.revenue_covered,
      'margin', CASE WHEN v_cost.revenue_covered > 0
                     THEN round(v_cost.revenue_covered - v_cost.cogs, 2) END,
      'margin_percent', CASE WHEN v_cost.revenue_covered > 0
                             THEN round((v_cost.revenue_covered - v_cost.cogs) / v_cost.revenue_covered * 100, 1) END
    ),
    'to_check', jsonb_build_object(
      'unconfirmed_payments', jsonb_build_object('count', v_unconfirmed.n, 'amount', v_unconfirmed.amount),
      'refunds_waiting', jsonb_build_object('count', v_refunds_waiting.n, 'amount', v_refunds_waiting.amount),
      'exchange_differences_owed', jsonb_build_object('count', v_exchange_owed.n, 'amount', v_exchange_owed.amount),
      'preorder_balances', jsonb_build_object('count', v_balances.n, 'amount', v_balances.amount)
    ),
    'suppliers', jsonb_build_object('open_purchase_orders', v_suppliers.n, 'open_cost', v_suppliers.amount)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.finance_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- One JSON array (not table rows), so the API row limit does not cut a long export short.
-- Rows: sales, refunds (negative) and return label costs (negative).
CREATE OR REPLACE FUNCTION public.finance_transactions(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows JSONB;
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'Only Super Admins and Order Processors can see Finance'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Invalid period'; END IF;

  SELECT COALESCE(jsonb_agg(x.j ORDER BY x.d), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT COALESCE(o.paid_at, o.created_at) AS d,
           jsonb_build_object(
             'date', COALESCE(o.paid_at, o.created_at),
             'type', 'sale',
             'reference', o.order_number,
             'order', o.order_number,
             'customer', o.customer_name,
             'payment_method', o.payment_method,
             'payment_reference', o.payment_reference,
             'items_gross', COALESCE((SELECT sum(COALESCE(i.list_unit_price, i.unit_price) * i.quantity)
                                      FROM public.sales_order_items i WHERE i.sales_order_id = o.id), 0),
             'discount', o.discount_amount,
             'shipping', o.shipping_cost,
             'order_total', o.total,
             'cash_in', o.amount_charged,
             'return_value', 0,
             'cash_out', 0,
             'label_cost', 0,
             'discount_code', o.discount_code
           ) AS j
    FROM public.sales_orders o
    WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'
      AND COALESCE(o.paid_at, o.created_at) BETWEEN p_from AND p_to

    UNION ALL

    SELECT r.refunded_at,
           jsonb_build_object(
             'date', r.refunded_at,
             'type', CASE WHEN r.resolution = 'exchange' THEN 'exchange_credit' ELSE 'refund' END,
             'reference', r.return_number,
             'order', o.order_number,
             'customer', r.customer_name,
             'payment_method', o.payment_method,
             'payment_reference', r.refund_reference,
             'items_gross', 0, 'discount', 0, 'shipping', 0, 'order_total', 0, 'cash_in', 0,
             'return_value', -(r.refund_amount - r.refund_deduction),
             'cash_out', -COALESCE(r.refunded_amount, 0),
             'label_cost', 0,
             'discount_code', ''
           )
    FROM public.return_requests r
    JOIN public.sales_orders o ON o.id = r.sales_order_id
    WHERE r.status = 'refunded' AND r.refunded_at BETWEEN p_from AND p_to

    UNION ALL

    SELECT r.label_created_at,
           jsonb_build_object(
             'date', r.label_created_at,
             'type', 'return_label_cost',
             'reference', r.return_number,
             'order', o.order_number,
             'customer', r.customer_name,
             'payment_method', '', 'payment_reference', '',
             'items_gross', 0, 'discount', 0, 'shipping', 0, 'order_total', 0, 'cash_in', 0,
             'return_value', 0, 'cash_out', 0,
             'label_cost', -r.label_cost,
             'discount_code', ''
           )
    FROM public.return_requests r
    JOIN public.sales_orders o ON o.id = r.sales_order_id
    WHERE r.label_created_at BETWEEN p_from AND p_to AND r.label_cost > 0
  ) x;

  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.finance_transactions(TIMESTAMPTZ, TIMESTAMPTZ) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_transactions(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
