-- Shipping labels: staff buy carrier labels (Sendcloud) for deliveries from the admin panel.
-- Needs 0011 and 0016 (store_settings). Safe to run more than once.
--
-- The label is bought by the Edge Function shipping-labels (the Sendcloud keys stay on the server).
-- A label belongs to a delivery that is still "preparing". Buying it fills in the carrier and the
-- tracking number of that delivery; cancelling it (before the carrier collects the parcel) clears
-- them again. PDFs are kept in a private bucket that only team members can read.
--
-- Weights: carriers price by weight. Each product can have a weight in grams; the label form adds a
-- packaging allowance, and uses a default package weight when no product has a weight.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight_grams INT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_weight_grams_check') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_weight_grams_check
      CHECK (weight_grams IS NULL OR (weight_grams > 0 AND weight_grams <= 30000));
  END IF;
END $$;

ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS label_parcel_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS label_service TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS label_tracking_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS label_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label_weight_grams INT,
  ADD COLUMN IF NOT EXISTS label_a6_path TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS label_a4_path TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS label_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS label_cancelled_at TIMESTAMPTZ;

-- Weights used to pre-fill the label form.
INSERT INTO public.store_settings (key, value) VALUES
  ('default_package_weight_grams', '2000'::jsonb),
  ('packaging_weight_grams', '250'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Label PDFs: private bucket, readable by the team only (the Edge Function writes with its own key).
INSERT INTO storage.buckets (id, name, public) VALUES ('shipping-labels', 'shipping-labels', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Staff read shipping labels" ON storage.objects;
CREATE POLICY "Staff read shipping labels" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'shipping-labels' AND public.is_staff(auth.uid()));
