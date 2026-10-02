-- Warranty and support tickets.
--
-- Customers (logged in or guests) open a ticket for product guidance or a defect; staff work it
-- from the admin panel and can schedule a visit.
--
--   status flow   open -> in_review -> awaiting_customer <-> in_review -> visit_scheduled -> resolved -> closed
--
-- Guests have no account, so they never read or write the tables directly. They go through three
-- SECURITY DEFINER functions, each guarded by ticket number + email:
--   create_warranty_ticket   opens a ticket (checks the order number + email against sales_orders)
--   get_warranty_ticket      returns the ticket and its public messages
--   add_warranty_message     adds a customer reply
-- Logged-in customers can additionally read their own tickets directly (customer_id = auth.uid()).
-- The warranty period (2 years) starts at the delivery date of the matched order.

CREATE SEQUENCE IF NOT EXISTS public.warranty_ticket_seq START 1;

CREATE TABLE public.warranty_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE DEFAULT 'WT-' || lpad(nextval('public.warranty_ticket_seq')::text, 5, '0'),
  type TEXT NOT NULL CHECK (type IN ('guidance', 'defect', 'other')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'awaiting_customer', 'visit_scheduled', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  order_number_given TEXT NOT NULL DEFAULT '',
  purchase_verified BOOLEAN NOT NULL DEFAULT false,
  warranty_expires_at TIMESTAMPTZ,
  product_name TEXT NOT NULL DEFAULT '',
  serial_number TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  visit_scheduled_at TIMESTAMPTZ,
  visit_notes TEXT NOT NULL DEFAULT '',
  resolution TEXT NOT NULL DEFAULT '',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX warranty_tickets_customer_idx ON public.warranty_tickets (customer_id);
CREATE INDEX warranty_tickets_email_idx ON public.warranty_tickets (lower(customer_email));
CREATE INDEX warranty_tickets_status_idx ON public.warranty_tickets (status);

CREATE TABLE public.warranty_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.warranty_tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('customer', 'staff')),
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (author_type = 'staff' OR is_internal = false)
);
CREATE INDEX warranty_messages_ticket_idx ON public.warranty_messages (ticket_id, created_at);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warranty_ticket_before_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'visit_scheduled' AND NEW.visit_scheduled_at IS NULL THEN
    RAISE EXCEPTION 'Set a visit date before scheduling a visit';
  END IF;
  IF NEW.status IN ('resolved', 'closed') THEN
    NEW.resolved_at := COALESCE(OLD.resolved_at, now());
  ELSE
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER warranty_tickets_before_update BEFORE UPDATE ON public.warranty_tickets
FOR EACH ROW EXECUTE FUNCTION public.warranty_ticket_before_update();

CREATE OR REPLACE FUNCTION public.warranty_message_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.warranty_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER warranty_messages_after_insert AFTER INSERT ON public.warranty_messages
FOR EACH ROW EXECUTE FUNCTION public.warranty_message_after_insert();

-- ---------------------------------------------------------------------------
-- Guest-safe functions (ticket number + email is the credential)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_warranty_ticket(
  p_type TEXT,
  p_name TEXT,
  p_email TEXT,
  p_order_number TEXT,
  p_product_name TEXT,
  p_serial_number TEXT,
  p_subject TEXT,
  p_description TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_name TEXT := trim(COALESCE(p_name, ''));
  v_subject TEXT := trim(COALESCE(p_subject, ''));
  v_description TEXT := trim(COALESCE(p_description, ''));
  v_order_number TEXT := upper(trim(COALESCE(p_order_number, '')));
  v_order public.sales_orders%ROWTYPE;
  v_delivered TIMESTAMPTZ;
  v_expires TIMESTAMPTZ;
  v_verified BOOLEAN := false;
  v_ticket public.warranty_tickets%ROWTYPE;
BEGIN
  IF p_type NOT IN ('guidance', 'defect', 'other') THEN
    RAISE EXCEPTION 'Invalid ticket type';
  END IF;
  IF v_name = '' OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Enter your name';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 255 THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;
  IF v_subject = '' OR char_length(v_subject) > 160 THEN
    RAISE EXCEPTION 'Enter a subject';
  END IF;
  IF char_length(v_description) < 10 OR char_length(v_description) > 4000 THEN
    RAISE EXCEPTION 'Describe the problem in 10 to 4000 characters';
  END IF;

  -- Light spam guard: at most 5 tickets per email per day.
  IF (SELECT count(*) FROM public.warranty_tickets
      WHERE lower(customer_email) = v_email AND created_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'Too many tickets today. Please reply to an existing ticket instead.';
  END IF;

  IF v_order_number <> '' THEN
    SELECT * INTO v_order FROM public.sales_orders
    WHERE upper(order_number) = v_order_number AND lower(customer_email) = v_email
    LIMIT 1;
    IF FOUND THEN
      v_verified := true;
      SELECT max(delivered_at) INTO v_delivered FROM public.delivery_orders
      WHERE sales_order_id = v_order.id AND status = 'delivered';
      IF v_delivered IS NOT NULL THEN
        v_expires := v_delivered + interval '2 years';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.warranty_tickets (
    type, customer_id, customer_name, customer_email, sales_order_id, order_number_given,
    purchase_verified, warranty_expires_at, product_name, serial_number, subject, description
  ) VALUES (
    p_type, auth.uid(), v_name, v_email, CASE WHEN v_verified THEN v_order.id END,
    left(v_order_number, 40), v_verified, v_expires, left(trim(COALESCE(p_product_name, '')), 160),
    left(trim(COALESCE(p_serial_number, '')), 80), v_subject, v_description
  ) RETURNING * INTO v_ticket;

  RETURN jsonb_build_object('ticket_number', v_ticket.ticket_number, 'purchase_verified', v_verified);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_warranty_ticket(p_ticket_number TEXT, p_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ticket public.warranty_tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_ticket FROM public.warranty_tickets
  WHERE ticket_number = upper(trim(COALESCE(p_ticket_number, '')));
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT (
    (auth.uid() IS NOT NULL AND v_ticket.customer_id = auth.uid())
    OR lower(v_ticket.customer_email) = lower(trim(COALESCE(p_email, '')))
  ) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'ticket_number', v_ticket.ticket_number,
    'type', v_ticket.type,
    'status', v_ticket.status,
    'subject', v_ticket.subject,
    'description', v_ticket.description,
    'product_name', v_ticket.product_name,
    'serial_number', v_ticket.serial_number,
    'purchase_verified', v_ticket.purchase_verified,
    'warranty_expires_at', v_ticket.warranty_expires_at,
    'visit_scheduled_at', v_ticket.visit_scheduled_at,
    'resolution', v_ticket.resolution,
    'created_at', v_ticket.created_at,
    'updated_at', v_ticket.updated_at,
    'messages', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('author_type', m.author_type, 'author_name', m.author_name,
                           'body', m.body, 'created_at', m.created_at)
        ORDER BY m.created_at)
      FROM public.warranty_messages m
      WHERE m.ticket_id = v_ticket.id AND NOT m.is_internal
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_warranty_message(p_ticket_number TEXT, p_email TEXT, p_body TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ticket public.warranty_tickets%ROWTYPE;
  v_body TEXT := trim(COALESCE(p_body, ''));
BEGIN
  IF v_body = '' OR char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'Enter a message of up to 4000 characters';
  END IF;

  SELECT * INTO v_ticket FROM public.warranty_tickets
  WHERE ticket_number = upper(trim(COALESCE(p_ticket_number, '')));
  IF NOT FOUND OR NOT (
    (auth.uid() IS NOT NULL AND v_ticket.customer_id = auth.uid())
    OR lower(v_ticket.customer_email) = lower(trim(COALESCE(p_email, '')))
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  IF v_ticket.status = 'closed' THEN
    RAISE EXCEPTION 'This ticket is closed. Please open a new ticket.';
  END IF;

  INSERT INTO public.warranty_messages (ticket_id, author_type, author_id, author_name, body)
  VALUES (v_ticket.id, 'customer', auth.uid(), v_ticket.customer_name, v_body);

  -- A customer reply puts the ticket back in the staff queue.
  IF v_ticket.status IN ('awaiting_customer', 'resolved') THEN
    UPDATE public.warranty_tickets SET status = 'in_review' WHERE id = v_ticket.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_warranty_ticket(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public;
REVOKE ALL ON FUNCTION public.get_warranty_ticket(TEXT, TEXT) FROM public;
REVOKE ALL ON FUNCTION public.add_warranty_message(TEXT, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.create_warranty_ticket(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_warranty_ticket(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_warranty_message(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_tickets, public.warranty_messages TO authenticated;
GRANT ALL ON public.warranty_tickets, public.warranty_messages TO service_role;
GRANT USAGE ON SEQUENCE public.warranty_ticket_seq TO authenticated, service_role;

ALTER TABLE public.warranty_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff or owner read warranty tickets" ON public.warranty_tickets
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR customer_id = auth.uid());
CREATE POLICY "Staff write warranty tickets" ON public.warranty_tickets
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff update warranty tickets" ON public.warranty_tickets
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Admins delete warranty tickets" ON public.warranty_tickets
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Staff or owner read warranty messages" ON public.warranty_messages
  FOR SELECT TO authenticated USING (
    public.is_staff(auth.uid())
    OR (
      NOT is_internal
      AND EXISTS (SELECT 1 FROM public.warranty_tickets t WHERE t.id = ticket_id AND t.customer_id = auth.uid())
    )
  );
CREATE POLICY "Staff write warranty messages" ON public.warranty_messages
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND author_type = 'staff');
CREATE POLICY "Admins delete warranty messages" ON public.warranty_messages
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
