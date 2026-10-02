-- Gift cards, phase 1: staff issue gift cards, customers use them at checkout. Needs 0021 (can_price_orders).
-- Safe to run more than once.
--
-- A gift card is a prepaid balance, NOT a discount: it pays for an order after discounts and
-- shipping are worked out. Selling it is not revenue; the unused balance is a debt to the customer
-- (shown in Finance as the outstanding balance) and revenue is the order it pays for.
--
--   * Maximum value of one card: gift_card_max_amount() = 200 EUR. No expiry unless staff set one
--     (in Germany a gift card generally may not expire within 3 years).
--   * Only Super Admins and Order Processors can see or create cards. Customers never read the
--     tables; they only call check_gift_card() and apply_gift_card_to_order() with the secret code.
--   * Balances change only through the ledger (gift_card_transactions): issued, redeemed, restored,
--     refunded_to_card, adjusted. Every balance is the sum of its ledger.
--   * One card per order for now. The balance is held when it is applied to an order. If that order
--     is cancelled, or stays unpaid and unreported for 3 hours, the balance is restored.
--   * If a card covers the whole order, the order is marked paid at once (nothing external to
--     verify). If it covers part, the rest is paid with PayPal as usual.
--   * Returns: the gift card part of a refund is credited back to the card (credit_gift_card_for_return);
--     the PayPal refund only covers the rest.

CREATE OR REPLACE FUNCTION public.gift_card_max_amount() RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$ SELECT 200::NUMERIC $$;

CREATE TABLE IF NOT EXISTS public.gift_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  initial_amount NUMERIC(10,2) NOT NULL CHECK (initial_amount > 0),
  balance NUMERIC(10,2) NOT NULL CHECK (balance >= 0),
  recipient_email TEXT NOT NULL DEFAULT '',
  recipient_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gift_cards_code_plain_idx ON public.gift_cards (replace(code, '-', ''));

DROP TRIGGER IF EXISTS gift_cards_touch_updated_at ON public.gift_cards;
CREATE TRIGGER gift_cards_touch_updated_at BEFORE UPDATE ON public.gift_cards
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.gift_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id UUID NOT NULL REFERENCES public.gift_cards(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('issued', 'redeemed', 'restored', 'refunded_to_card', 'adjusted')),
  amount NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2) NOT NULL CHECK (balance_after >= 0),
  sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  return_request_id UUID REFERENCES public.return_requests(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gift_card_transactions_card_idx ON public.gift_card_transactions (gift_card_id, created_at);
CREATE INDEX IF NOT EXISTS gift_card_transactions_order_idx ON public.gift_card_transactions (sales_order_id);

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS gift_card_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gift_card_hint TEXT NOT NULL DEFAULT '';

ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS gift_card_refund NUMERIC(10,2);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_gift_card_code() RETURNS TEXT
LANGUAGE sql VOLATILE AS $$
  SELECT 'GC-' || substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4) || '-' || substr(h, 13, 4)
  FROM (SELECT upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 16)) AS h) x
$$;

-- "gc 1a2b-3c4d..." and "1A2B3C4D..." both become the comparable form GC1A2B3C4D...
CREATE OR REPLACE FUNCTION public.gift_card_plain_code(p_code TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v LIKE 'GC%' THEN v ELSE 'GC' || v END
  FROM (SELECT upper(regexp_replace(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g')) AS v) x
$$;

-- Internal: change a card's balance and write the ledger line. Locks the card.
CREATE OR REPLACE FUNCTION public.gift_card_move(
  p_card_id UUID, p_amount NUMERIC, p_type TEXT, p_order_id UUID, p_return_id UUID, p_note TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  UPDATE public.gift_cards SET balance = balance + p_amount WHERE id = p_card_id RETURNING balance INTO v_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift card not found'; END IF;
  IF v_balance < 0 THEN RAISE EXCEPTION 'The gift card balance is too low'; END IF;
  INSERT INTO public.gift_card_transactions (gift_card_id, type, amount, balance_after, sales_order_id, return_request_id, note, created_by)
  VALUES (p_card_id, p_type, p_amount, v_balance, p_order_id, p_return_id, COALESCE(p_note, ''), auth.uid());
  RETURN v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.gift_card_move(UUID, NUMERIC, TEXT, UUID, UUID, TEXT) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff: issue, switch off, correct
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_gift_card(
  p_amount NUMERIC, p_recipient_email TEXT, p_recipient_name TEXT, p_note TEXT, p_expires_at TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code TEXT;
  v_id UUID;
  v_email TEXT := lower(trim(COALESCE(p_recipient_email, '')));
  v_tries INT := 0;
BEGIN
  IF NOT public.can_price_orders(auth.uid()) THEN RAISE EXCEPTION 'Only Super Admins and Order Processors can issue gift cards'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > public.gift_card_max_amount() THEN
    RAISE EXCEPTION 'The value must be between 1 and % EUR', public.gift_card_max_amount();
  END IF;
  IF v_email <> '' AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Enter a valid recipient email'; END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN RAISE EXCEPTION 'The expiry date must be in the future'; END IF;

  LOOP
    v_code := public.generate_gift_card_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.gift_cards WHERE replace(code, '-', '') = replace(v_code, '-', ''));
    v_tries := v_tries + 1;
    IF v_tries > 5 THEN RAISE EXCEPTION 'Could not generate a unique code, try again'; END IF;
  END LOOP;

  -- Created empty; the value arrives through the ledger so the first line is "issued".
  INSERT INTO public.gift_cards (code, initial_amount, balance, recipient_email, recipient_name, note, expires_at, created_by)
  VALUES (v_code, round(p_amount, 2), 0, v_email, left(trim(COALESCE(p_recipient_name, '')), 120),
          left(trim(COALESCE(p_note, '')), 500), p_expires_at, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.gift_card_move(v_id, round(p_amount, 2), 'issued', NULL, NULL, left(trim(COALESCE(p_note, '')), 500));

  RETURN jsonb_build_object('id', v_id, 'code', v_code);
END;
$$;
REVOKE ALL ON FUNCTION public.create_gift_card(NUMERIC, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_gift_card(NUMERIC, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_gift_card_status(p_id UUID, p_active BOOLEAN) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_price_orders(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.gift_cards SET status = CASE WHEN p_active THEN 'active' ELSE 'disabled' END WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift card not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_gift_card_status(UUID, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_gift_card_status(UUID, BOOLEAN) TO authenticated;

-- Correct a balance (positive or negative); a note is required and the result stays within 0..max.
CREATE OR REPLACE FUNCTION public.adjust_gift_card(p_id UUID, p_amount NUMERIC, p_note TEXT) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF NOT public.can_price_orders(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN RAISE EXCEPTION 'Enter an amount other than 0'; END IF;
  IF trim(COALESCE(p_note, '')) = '' THEN RAISE EXCEPTION 'Give a reason for the correction'; END IF;
  SELECT balance INTO v_balance FROM public.gift_cards WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift card not found'; END IF;
  IF v_balance + p_amount > public.gift_card_max_amount() THEN
    RAISE EXCEPTION 'The balance cannot be more than % EUR', public.gift_card_max_amount();
  END IF;
  RETURN public.gift_card_move(p_id, round(p_amount, 2), 'adjusted', NULL, NULL, left(trim(p_note), 500));
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_gift_card(UUID, NUMERIC, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adjust_gift_card(UUID, NUMERIC, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Holds that are not used are given back
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_card_restore_for_order(p_order_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  -- What is still held on this order, per card: redeemed (negative) minus what already came back.
  FOR r IN
    SELECT gift_card_id, -sum(amount) AS held
    FROM public.gift_card_transactions
    WHERE sales_order_id = p_order_id AND type IN ('redeemed', 'restored', 'refunded_to_card')
    GROUP BY gift_card_id
    HAVING -sum(amount) > 0
  LOOP
    PERFORM public.gift_card_move(r.gift_card_id, r.held, 'restored', p_order_id, NULL, 'Order cancelled');
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.gift_card_restore_for_order(UUID) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gift_card_on_order_cancelled() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    PERFORM public.gift_card_restore_for_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sales_orders_gift_card_restore ON public.sales_orders;
CREATE TRIGGER sales_orders_gift_card_restore AFTER UPDATE OF status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.gift_card_on_order_cancelled();

-- Orders that took a gift card hold but were never paid or reported are cancelled after 3 hours,
-- which gives the balance back. Run lazily whenever a card is checked or applied.
CREATE OR REPLACE FUNCTION public.gift_card_release_stale() RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sales_orders o SET status = 'cancelled'
  WHERE o.payment_status = 'unpaid' AND o.status = 'open' AND o.payment_reported_at IS NULL
    AND o.created_at < now() - interval '3 hours'
    AND EXISTS (SELECT 1 FROM public.gift_card_transactions t WHERE t.sales_order_id = o.id AND t.type = 'redeemed');
END;
$$;
REVOKE ALL ON FUNCTION public.gift_card_release_stale() FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Customers (anonymous): check a code, apply it to an order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_gift_card(p_code TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card public.gift_cards%ROWTYPE;
  v_plain TEXT := public.gift_card_plain_code(p_code);
BEGIN
  PERFORM public.gift_card_release_stale();
  IF length(v_plain) < 10 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO v_card FROM public.gift_cards WHERE replace(code, '-', '') = v_plain;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF v_card.status <> 'active' THEN RETURN jsonb_build_object('status', 'disabled'); END IF;
  IF v_card.expires_at IS NOT NULL AND v_card.expires_at < now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF v_card.balance <= 0 THEN RETURN jsonb_build_object('status', 'empty'); END IF;
  RETURN jsonb_build_object('status', 'ok', 'balance', v_card.balance);
END;
$$;
REVOKE ALL ON FUNCTION public.check_gift_card(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.check_gift_card(TEXT) TO anon, authenticated;

-- Applies a gift card to an unpaid checkout order (order number + email prove it is yours).
-- Takes min(balance, amount due). If nothing is left to pay, the order is marked paid.
CREATE OR REPLACE FUNCTION public.apply_gift_card_to_order(p_order_number TEXT, p_email TEXT, p_code TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_card public.gift_cards%ROWTYPE;
  v_plain TEXT := public.gift_card_plain_code(p_code);
  v_apply NUMERIC;
  v_due NUMERIC;
BEGIN
  PERFORM public.gift_card_release_stale();

  SELECT * INTO v_order FROM public.sales_orders
  WHERE upper(order_number) = upper(trim(COALESCE(p_order_number, '')))
    AND customer_email <> '' AND lower(customer_email) = lower(trim(COALESCE(p_email, '')))
    AND source = 'checkout'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.payment_status <> 'unpaid' OR v_order.status <> 'open' THEN RAISE EXCEPTION 'This order can no longer take a gift card'; END IF;
  IF v_order.gift_card_amount > 0 THEN RAISE EXCEPTION 'A gift card was already used on this order'; END IF;
  IF v_order.amount_charged <= 0 THEN RAISE EXCEPTION 'There is nothing to pay on this order'; END IF;

  SELECT * INTO v_card FROM public.gift_cards WHERE replace(code, '-', '') = v_plain FOR UPDATE;
  IF NOT FOUND OR v_card.status <> 'active' OR (v_card.expires_at IS NOT NULL AND v_card.expires_at < now()) THEN
    RAISE EXCEPTION 'gift_card:invalid';
  END IF;
  IF v_card.balance <= 0 THEN RAISE EXCEPTION 'gift_card:empty'; END IF;

  v_apply := least(v_card.balance, v_order.amount_charged);
  PERFORM public.gift_card_move(v_card.id, -v_apply, 'redeemed', v_order.id, NULL, v_order.order_number);
  v_due := v_order.amount_charged - v_apply;

  UPDATE public.sales_orders
  SET amount_charged = v_due,
      gift_card_amount = v_apply,
      gift_card_hint = 'GC-••••-••••-••••-' || right(v_plain, 4),
      payment_method = CASE WHEN v_due = 0 THEN 'gift_card' ELSE payment_method END
  WHERE id = v_order.id;

  -- The gift card covers everything: there is no outside payment to wait for.
  IF v_due = 0 THEN
    UPDATE public.sales_orders SET payment_status = 'paid' WHERE id = v_order.id;
  END IF;

  RETURN jsonb_build_object('applied', v_apply, 'amount_due', v_due, 'paid', v_due = 0, 'remaining_balance', v_card.balance - v_apply);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_gift_card_to_order(TEXT, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_gift_card_to_order(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Returns: the gift card part of a refund goes back to the card
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_gift_card_for_return(p_return_id UUID, p_amount NUMERIC) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_return public.return_requests%ROWTYPE;
  v_card UUID;
  v_held NUMERIC;
BEGIN
  IF NOT public.can_price_orders(auth.uid()) THEN RAISE EXCEPTION 'Only Super Admins and Order Processors can credit gift cards'; END IF;
  SELECT * INTO v_return FROM public.return_requests WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF v_return.status <> 'received' THEN RAISE EXCEPTION 'Mark the parcel as received before crediting the gift card'; END IF;
  IF v_return.gift_card_refund IS NOT NULL THEN RAISE EXCEPTION 'The gift card part of this refund was already decided'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Enter an amount of 0 or more'; END IF;

  IF p_amount > 0 THEN
    -- The card that paid this order, and how much of it is still "spent" (not returned yet).
    SELECT gift_card_id, -sum(amount) INTO v_card, v_held
    FROM public.gift_card_transactions
    WHERE sales_order_id = v_return.sales_order_id AND type IN ('redeemed', 'restored', 'refunded_to_card')
    GROUP BY gift_card_id
    ORDER BY -sum(amount) DESC LIMIT 1;
    IF v_card IS NULL OR COALESCE(v_held, 0) <= 0 THEN RAISE EXCEPTION 'No gift card payment found on this order'; END IF;
    IF p_amount > v_held THEN RAISE EXCEPTION 'At most % EUR can go back to the gift card', v_held; END IF;
    PERFORM public.gift_card_move(v_card, round(p_amount, 2), 'refunded_to_card', v_return.sales_order_id, v_return.id, v_return.return_number);
  END IF;

  UPDATE public.return_requests SET gift_card_refund = round(p_amount, 2) WHERE id = p_return_id;
  RETURN round(p_amount, 2);
END;
$$;
REVOKE ALL ON FUNCTION public.credit_gift_card_for_return(UUID, NUMERIC) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.credit_gift_card_for_return(UUID, NUMERIC) TO authenticated;

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_card_summary(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period RECORD;
  v_out RECORD;
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'Only Super Admins and Order Processors can see Finance'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Invalid period'; END IF;

  SELECT COALESCE(sum(amount) FILTER (WHERE type = 'issued'), 0) AS issued,
         COALESCE(-sum(amount) FILTER (WHERE type = 'redeemed'), 0) AS redeemed,
         COALESCE(sum(amount) FILTER (WHERE type IN ('restored', 'refunded_to_card')), 0) AS returned,
         COALESCE(sum(amount) FILTER (WHERE type = 'adjusted'), 0) AS adjusted
  INTO v_period
  FROM public.gift_card_transactions WHERE created_at BETWEEN p_from AND p_to;

  -- Everything still owed to customers: active cards, expired ones included (conservative).
  SELECT count(*) FILTER (WHERE balance > 0) AS cards, COALESCE(sum(balance), 0) AS balance
  INTO v_out
  FROM public.gift_cards WHERE status = 'active';

  RETURN jsonb_build_object(
    'issued', v_period.issued, 'redeemed', v_period.redeemed,
    'returned_to_cards', v_period.returned, 'adjusted', v_period.adjusted,
    'outstanding_balance', v_out.balance, 'cards_with_balance', v_out.cards
  );
END;
$$;
REVOKE ALL ON FUNCTION public.gift_card_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gift_card_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- Ledger lines for the accountant's CSV (codes are masked to the last 4 characters).
CREATE OR REPLACE FUNCTION public.gift_card_ledger(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'Only Super Admins and Order Processors can see Finance'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Invalid period'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'date', t.created_at, 'type', t.type, 'amount', t.amount,
      'card', 'GC-••••-••••-••••-' || right(replace(c.code, '-', ''), 4),
      'order', o.order_number, 'return', r.return_number) ORDER BY t.created_at)
    FROM public.gift_card_transactions t
    JOIN public.gift_cards c ON c.id = t.gift_card_id
    LEFT JOIN public.sales_orders o ON o.id = t.sales_order_id
    LEFT JOIN public.return_requests r ON r.id = t.return_request_id
    WHERE t.created_at BETWEEN p_from AND p_to
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.gift_card_ledger(TIMESTAMPTZ, TIMESTAMPTZ) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gift_card_ledger(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------------
-- Access: read-only for staff who may handle money; all changes go through the functions above.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.gift_cards, public.gift_card_transactions TO authenticated;
GRANT ALL ON public.gift_cards, public.gift_card_transactions TO service_role;
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_card_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Money staff read gift cards" ON public.gift_cards;
CREATE POLICY "Money staff read gift cards" ON public.gift_cards
  FOR SELECT TO authenticated USING (public.can_price_orders(auth.uid()));
DROP POLICY IF EXISTS "Money staff read gift card ledger" ON public.gift_card_transactions;
CREATE POLICY "Money staff read gift card ledger" ON public.gift_card_transactions
  FOR SELECT TO authenticated USING (public.can_price_orders(auth.uid()));
