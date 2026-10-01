-- Inventory ledger, purchase orders, sales orders and delivery orders.
--
-- inventory holds three buckets per product:
--   on_hand    physically in the warehouse
--   in_transit ordered from a supplier, not received yet
--   committed  sold and paid, not yet picked up by the carrier
--   available  = on_hand - committed (this is what the storefront sells; kept in products.stock)
--
-- Stock only moves through triggers on the order tables (and adjust_inventory), and every
-- movement is written to inventory_movements.
--
--   purchase order  draft -> ordered            in_transit += ordered
--   purchase item   received qty edited         on_hand += received, in_transit -= received
--   purchase order  -> received / cancelled     remaining in_transit is released
--   sales order     unpaid -> paid              committed += qty
--   sales order     -> cancelled                unshipped committed is released
--   delivery order  preparing -> on_delivery    on_hand -= qty, committed -= qty
--   delivery order  on_delivery -> delivered    no stock change; order completes when fully delivered

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.inventory (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  on_hand INT NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  in_transit INT NOT NULL DEFAULT 0 CHECK (in_transit >= 0),
  committed INT NOT NULL DEFAULT 0 CHECK (committed >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'initial', 'manual_adjustment',
    'po_ordered', 'po_received', 'po_closed',
    'so_paid', 'so_cancelled', 'shipped'
  )),
  on_hand_delta INT NOT NULL DEFAULT 0,
  in_transit_delta INT NOT NULL DEFAULT 0,
  committed_delta INT NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id UUID,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_product_idx ON public.inventory_movements (product_id, created_at DESC);
CREATE INDEX inventory_movements_ref_idx ON public.inventory_movements (reference_type, reference_id);

CREATE SEQUENCE public.purchase_order_seq;
CREATE SEQUENCE public.sales_order_seq;
CREATE SEQUENCE public.delivery_order_seq;

CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT NOT NULL UNIQUE DEFAULT 'PO-' || lpad(nextval('public.purchase_order_seq')::text, 5, '0'),
  supplier_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  expected_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_ordered INT NOT NULL CHECK (quantity_ordered > 0),
  quantity_received INT NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  UNIQUE (purchase_order_id, product_id)
);

CREATE TABLE public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE DEFAULT 'SO-' || lpad(nextval('public.sales_order_seq')::text, 5, '0'),
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  total NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sales_orders_customer_idx ON public.sales_orders (customer_id);

CREATE TABLE public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  UNIQUE (sales_order_id, product_id)
);

CREATE TABLE public.delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number TEXT NOT NULL UNIQUE DEFAULT 'DO-' || lpad(nextval('public.delivery_order_seq')::text, 5, '0'),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'on_delivery', 'delivered', 'cancelled')),
  carrier TEXT,
  tracking_number TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX delivery_orders_sales_order_idx ON public.delivery_orders (sales_order_id);

CREATE TABLE public.delivery_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id UUID NOT NULL REFERENCES public.delivery_orders(id) ON DELETE CASCADE,
  sales_order_item_id UUID NOT NULL REFERENCES public.sales_order_items(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  UNIQUE (delivery_order_id, sales_order_item_id)
);

CREATE TRIGGER purchase_orders_touch_updated_at BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sales_orders_touch_updated_at BEFORE UPDATE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER delivery_orders_touch_updated_at BEFORE UPDATE ON public.delivery_orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Core: the only place that changes inventory
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_inventory_change(
  p_product_id UUID,
  p_on_hand INT,
  p_in_transit INT,
  p_committed INT,
  p_type TEXT,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_on_hand = 0 AND p_in_transit = 0 AND p_committed = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.inventory (product_id) VALUES (p_product_id)
  ON CONFLICT (product_id) DO NOTHING;

  -- The CHECK (>= 0) constraints reject changes that would make a bucket negative.
  UPDATE public.inventory
  SET on_hand = on_hand + p_on_hand,
      in_transit = in_transit + p_in_transit,
      committed = committed + p_committed,
      updated_at = now()
  WHERE product_id = p_product_id;

  INSERT INTO public.inventory_movements (
    product_id, movement_type, on_hand_delta, in_transit_delta, committed_delta,
    reference_type, reference_id, note, created_by
  ) VALUES (
    p_product_id, p_type, p_on_hand, p_in_transit, p_committed,
    p_ref_type, p_ref_id, p_note, auth.uid()
  );

  -- The storefront reads products.stock, which mirrors the available quantity.
  PERFORM set_config('app.inventory_sync', 'on', true);
  UPDATE public.products p
  SET stock = GREATEST(i.on_hand - i.committed, 0)
  FROM public.inventory i
  WHERE i.product_id = p.id AND p.id = p_product_id;
  PERFORM set_config('app.inventory_sync', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_inventory_change(UUID, INT, INT, INT, TEXT, TEXT, UUID, TEXT)
  FROM public, anon, authenticated;

-- Manual adjustment (stock count, damage, correction). Positive or negative change to on_hand.
CREATE OR REPLACE FUNCTION public.adjust_inventory(p_product_id UUID, p_change INT, p_reason TEXT DEFAULT 'correction')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to adjust inventory';
  END IF;
  PERFORM public.apply_inventory_change(
    p_product_id, p_change, 0, 0, 'manual_adjustment', 'adjustment', NULL, p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_inventory(UUID, INT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(UUID, INT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Keep inventory in step with the products table
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.products_inventory_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_inventory_change(NEW.id, NEW.stock, 0, 0, 'initial', 'product', NEW.id, 'Product created');
  INSERT INTO public.inventory (product_id) VALUES (NEW.id) ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_inventory_insert AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_inventory_insert();

-- A direct edit of products.stock (e.g. the product form) becomes a manual adjustment.
CREATE OR REPLACE FUNCTION public.products_inventory_stock_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.inventory_sync', true) IS DISTINCT FROM 'on' THEN
    PERFORM public.apply_inventory_change(
      NEW.id, NEW.stock - OLD.stock, 0, 0, 'manual_adjustment', 'product', NEW.id, 'products.stock edited'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_inventory_stock_edit AFTER UPDATE OF stock ON public.products
FOR EACH ROW WHEN (NEW.stock IS DISTINCT FROM OLD.stock)
EXECUTE FUNCTION public.products_inventory_stock_edit();

-- Existing products start with their current stock on hand.
INSERT INTO public.inventory (product_id, on_hand)
SELECT id, stock FROM public.products;
INSERT INTO public.inventory_movements (product_id, movement_type, on_hand_delta, reference_type, reference_id, note)
SELECT id, 'initial', stock, 'product', id, 'Backfilled from products.stock' FROM public.products WHERE stock > 0;

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_order_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('ordered', 'cancelled'))
      OR (OLD.status = 'ordered' AND NEW.status IN ('partially_received', 'received', 'cancelled'))
      OR (OLD.status = 'partially_received' AND NEW.status IN ('received', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Purchase order cannot go from % to %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'ordered' THEN NEW.ordered_at = now(); END IF;
    IF NEW.status IN ('received', 'cancelled') THEN NEW.received_at = now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_order_before_update BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.purchase_order_before_update();

CREATE OR REPLACE FUNCTION public.purchase_order_after_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'ordered' THEN
    FOR item IN SELECT * FROM public.purchase_order_items WHERE purchase_order_id = NEW.id LOOP
      PERFORM public.apply_inventory_change(
        item.product_id, 0, item.quantity_ordered, 0, 'po_ordered', 'purchase_order', NEW.id, NEW.po_number
      );
    END LOOP;
  ELSIF OLD.status IN ('ordered', 'partially_received') AND NEW.status IN ('received', 'cancelled') THEN
    -- Anything not received (short delivery or cancellation) is no longer on its way.
    FOR item IN
      SELECT * FROM public.purchase_order_items
      WHERE purchase_order_id = NEW.id AND quantity_ordered > quantity_received
    LOOP
      PERFORM public.apply_inventory_change(
        item.product_id, 0, -(item.quantity_ordered - item.quantity_received), 0,
        'po_closed', 'purchase_order', NEW.id, NEW.po_number
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_order_after_status AFTER UPDATE OF status ON public.purchase_orders
FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.purchase_order_after_status();

-- Lines are editable only while the order is a draft; received quantities only once ordered.
CREATE OR REPLACE FUNCTION public.purchase_order_item_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  po_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO po_status FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
    IF po_status <> 'draft' THEN RAISE EXCEPTION 'Items can only be added to a draft purchase order'; END IF;
    IF NEW.quantity_received <> 0 THEN RAISE EXCEPTION 'Nothing can be received on a draft purchase order'; END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT status INTO po_status FROM public.purchase_orders WHERE id = OLD.purchase_order_id;
    IF po_status <> 'draft' THEN RAISE EXCEPTION 'Items can only be removed from a draft purchase order'; END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO po_status FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
  IF NEW.quantity_ordered IS DISTINCT FROM OLD.quantity_ordered
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id THEN
    IF po_status <> 'draft' THEN RAISE EXCEPTION 'Ordered quantities are locked once the purchase order is placed'; END IF;
  END IF;
  IF NEW.quantity_received IS DISTINCT FROM OLD.quantity_received
     AND po_status NOT IN ('ordered', 'partially_received') THEN
    RAISE EXCEPTION 'Quantities can only be received on an ordered purchase order';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_order_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.purchase_order_item_guard();

-- Receiving: on_hand grows by what arrived; in_transit shrinks by what was still expected.
CREATE OR REPLACE FUNCTION public.purchase_order_item_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  outstanding_before INT := GREATEST(NEW.quantity_ordered - OLD.quantity_received, 0);
  outstanding_after INT := GREATEST(NEW.quantity_ordered - NEW.quantity_received, 0);
BEGIN
  PERFORM public.apply_inventory_change(
    NEW.product_id,
    NEW.quantity_received - OLD.quantity_received,
    -(outstanding_before - outstanding_after),
    0,
    'po_received',
    'purchase_order',
    NEW.purchase_order_id,
    NULL
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_order_item_received AFTER UPDATE OF quantity_received ON public.purchase_order_items
FOR EACH ROW WHEN (NEW.quantity_received IS DISTINCT FROM OLD.quantity_received)
EXECUTE FUNCTION public.purchase_order_item_received();

-- ---------------------------------------------------------------------------
-- Sales orders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_order_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF NOT (
      (OLD.payment_status = 'unpaid' AND NEW.payment_status = 'paid')
      OR (OLD.payment_status = 'paid' AND NEW.payment_status = 'refunded')
    ) THEN
      RAISE EXCEPTION 'Payment status cannot go from % to %', OLD.payment_status, NEW.payment_status;
    END IF;
    IF NEW.payment_status = 'paid' THEN
      IF OLD.status <> 'open' THEN RAISE EXCEPTION 'A closed order cannot be paid'; END IF;
      NEW.paid_at = now();
    END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'open' AND NEW.status IN ('completed', 'cancelled')) THEN
      RAISE EXCEPTION 'Order cannot go from % to %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_order_before_update BEFORE UPDATE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.sales_order_before_update();

CREATE OR REPLACE FUNCTION public.sales_order_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
BEGIN
  -- Payment received: reserve the stock.
  IF OLD.payment_status = 'unpaid' AND NEW.payment_status = 'paid' THEN
    FOR item IN SELECT * FROM public.sales_order_items WHERE sales_order_id = NEW.id LOOP
      PERFORM public.apply_inventory_change(
        item.product_id, 0, 0, item.quantity, 'so_paid', 'sales_order', NEW.id, NEW.order_number
      );
    END LOOP;
  END IF;

  -- Cancelled: drop deliveries not yet picked up and release whatever was not shipped.
  IF OLD.status = 'open' AND NEW.status = 'cancelled' THEN
    UPDATE public.delivery_orders SET status = 'cancelled'
    WHERE sales_order_id = NEW.id AND status = 'preparing';

    -- Stock was reserved whenever the order had been paid.
    IF NEW.payment_status <> 'unpaid' THEN
      FOR item IN
        SELECT soi.product_id,
               soi.quantity - COALESCE((
                 SELECT SUM(di.quantity)
                 FROM public.delivery_order_items di
                 JOIN public.delivery_orders d ON d.id = di.delivery_order_id
                 WHERE di.sales_order_item_id = soi.id AND d.status IN ('on_delivery', 'delivered')
               ), 0) AS unshipped
        FROM public.sales_order_items soi
        WHERE soi.sales_order_id = NEW.id
      LOOP
        IF item.unshipped > 0 THEN
          PERFORM public.apply_inventory_change(
            item.product_id, 0, 0, -(item.unshipped)::int, 'so_cancelled', 'sales_order', NEW.id, NEW.order_number
          );
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_order_after_update AFTER UPDATE OF payment_status, status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.sales_order_after_update();

-- Lines are locked once the order is paid or cancelled.
CREATE OR REPLACE FUNCTION public.sales_order_item_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  so RECORD;
  so_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.sales_order_id ELSE NEW.sales_order_id END;
BEGIN
  SELECT payment_status, status INTO so FROM public.sales_orders WHERE id = so_id;
  IF so.payment_status <> 'unpaid' OR so.status <> 'open' THEN
    RAISE EXCEPTION 'Items cannot be changed once the order is paid or closed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER sales_order_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_items
FOR EACH ROW EXECUTE FUNCTION public.sales_order_item_guard();

-- ---------------------------------------------------------------------------
-- Delivery orders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delivery_order_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  so RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT payment_status, status INTO so FROM public.sales_orders WHERE id = NEW.sales_order_id;
    IF so.payment_status <> 'paid' OR so.status <> 'open' THEN
      RAISE EXCEPTION 'Delivery orders can only be created for open, paid sales orders';
    END IF;
    IF NEW.status <> 'preparing' THEN RAISE EXCEPTION 'A new delivery order starts as preparing'; END IF;
    RETURN NEW;
  END IF;

  IF NEW.sales_order_id IS DISTINCT FROM OLD.sales_order_id THEN
    RAISE EXCEPTION 'A delivery order cannot be moved to another sales order';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'preparing' AND NEW.status IN ('on_delivery', 'cancelled'))
      OR (OLD.status = 'on_delivery' AND NEW.status = 'delivered')
    ) THEN
      RAISE EXCEPTION 'Delivery cannot go from % to %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'on_delivery' THEN NEW.shipped_at = now(); END IF;
    IF NEW.status = 'delivered' THEN NEW.delivered_at = now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_order_before_write BEFORE INSERT OR UPDATE ON public.delivery_orders
FOR EACH ROW EXECUTE FUNCTION public.delivery_order_before_write();

CREATE OR REPLACE FUNCTION public.delivery_order_after_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  remaining INT;
BEGIN
  -- Picked up by the carrier: stock leaves the warehouse.
  IF OLD.status = 'preparing' AND NEW.status = 'on_delivery' THEN
    FOR item IN
      SELECT soi.product_id, di.quantity
      FROM public.delivery_order_items di
      JOIN public.sales_order_items soi ON soi.id = di.sales_order_item_id
      WHERE di.delivery_order_id = NEW.id
    LOOP
      PERFORM public.apply_inventory_change(
        item.product_id, -item.quantity, 0, -item.quantity, 'shipped', 'delivery_order', NEW.id, NEW.delivery_number
      );
    END LOOP;
  END IF;

  -- Delivered: complete the sales order once every line is fully delivered.
  IF OLD.status = 'on_delivery' AND NEW.status = 'delivered' THEN
    SELECT COUNT(*) INTO remaining
    FROM public.sales_order_items soi
    WHERE soi.sales_order_id = NEW.sales_order_id
      AND soi.quantity > COALESCE((
        SELECT SUM(di.quantity)
        FROM public.delivery_order_items di
        JOIN public.delivery_orders d ON d.id = di.delivery_order_id
        WHERE di.sales_order_item_id = soi.id AND d.status = 'delivered'
      ), 0);
    IF remaining = 0 THEN
      UPDATE public.sales_orders SET status = 'completed'
      WHERE id = NEW.sales_order_id AND status = 'open';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_order_after_status AFTER UPDATE OF status ON public.delivery_orders
FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.delivery_order_after_status();

-- A delivery can only ship what the sales order still has to send, and only while preparing.
CREATE OR REPLACE FUNCTION public.delivery_order_item_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  d RECORD;
  soi RECORD;
  already INT;
  d_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.delivery_order_id ELSE NEW.delivery_order_id END;
BEGIN
  SELECT status, sales_order_id INTO d FROM public.delivery_orders WHERE id = d_id;
  IF d.status <> 'preparing' THEN
    RAISE EXCEPTION 'Items can only change while the delivery is preparing';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  SELECT sales_order_id, quantity INTO soi FROM public.sales_order_items WHERE id = NEW.sales_order_item_id;
  IF soi.sales_order_id IS DISTINCT FROM d.sales_order_id THEN
    RAISE EXCEPTION 'Item does not belong to this sales order';
  END IF;

  SELECT COALESCE(SUM(di.quantity), 0) INTO already
  FROM public.delivery_order_items di
  JOIN public.delivery_orders o ON o.id = di.delivery_order_id
  WHERE di.sales_order_item_id = NEW.sales_order_item_id
    AND o.status <> 'cancelled'
    AND di.id IS DISTINCT FROM NEW.id;

  IF already + NEW.quantity > soi.quantity THEN
    RAISE EXCEPTION 'Quantity exceeds what is left to deliver (% of % already planned)', already, soi.quantity;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_order_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.delivery_order_items
FOR EACH ROW EXECUTE FUNCTION public.delivery_order_item_guard();

-- ---------------------------------------------------------------------------
-- Access: staff read everything; inventory/purchasing needs product rights,
-- sales and delivery are open to any staff role. Inventory tables are write-protected.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.inventory, public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory, public.inventory_movements TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.purchase_orders, public.purchase_order_items,
  public.sales_orders, public.sales_order_items,
  public.delivery_orders, public.delivery_order_items
TO authenticated;
GRANT ALL ON
  public.purchase_orders, public.purchase_order_items,
  public.sales_orders, public.sales_order_items,
  public.delivery_orders, public.delivery_order_items
TO service_role;
GRANT USAGE ON public.purchase_order_seq, public.sales_order_seq, public.delivery_order_seq TO authenticated, service_role;

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read inventory" ON public.inventory
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff read inventory movements" ON public.inventory_movements
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff read purchase orders" ON public.purchase_orders
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Inventory managers write purchase orders" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (public.can_manage_products(auth.uid())) WITH CHECK (public.can_manage_products(auth.uid()));

CREATE POLICY "Staff read purchase order items" ON public.purchase_order_items
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Inventory managers write purchase order items" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (public.can_manage_products(auth.uid())) WITH CHECK (public.can_manage_products(auth.uid()));

CREATE POLICY "Staff read sales orders" ON public.sales_orders
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR customer_id = auth.uid());
CREATE POLICY "Staff write sales orders" ON public.sales_orders
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff or owner read sales order items" ON public.sales_order_items
  FOR SELECT TO authenticated USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.sales_orders so WHERE so.id = sales_order_id AND so.customer_id = auth.uid())
  );
CREATE POLICY "Staff write sales order items" ON public.sales_order_items
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff read delivery orders" ON public.delivery_orders
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff write delivery orders" ON public.delivery_orders
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff read delivery order items" ON public.delivery_order_items
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff write delivery order items" ON public.delivery_order_items
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
