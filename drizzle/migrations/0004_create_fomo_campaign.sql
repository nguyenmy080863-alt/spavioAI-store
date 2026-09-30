CREATE TABLE public.fomo_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Evergreen FOMO',
  is_active BOOLEAN NOT NULL DEFAULT false,
  headline TEXT NOT NULL DEFAULT 'Limited time offer',
  duration_hours NUMERIC NOT NULL DEFAULT 48,
  reset_mode TEXT NOT NULL DEFAULT 'loop',
  reset_delay_hours NUMERIC NOT NULL DEFAULT 0,
  total_fake_stock INTEGER NOT NULL DEFAULT 100,
  initial_sold_percent NUMERIC NOT NULL DEFAULT 75,
  auto_increment_enabled BOOLEAN NOT NULL DEFAULT true,
  increment_min INTEGER NOT NULL DEFAULT 1,
  increment_max INTEGER NOT NULL DEFAULT 2,
  increment_interval_seconds INTEGER NOT NULL DEFAULT 180,
  max_sold_percent NUMERIC NOT NULL DEFAULT 95,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fomo_reset_mode_check CHECK (reset_mode IN ('loop', 'delay')),
  CONSTRAINT fomo_duration_check CHECK (duration_hours > 0),
  CONSTRAINT fomo_stock_check CHECK (total_fake_stock > 0),
  CONSTRAINT fomo_sold_check CHECK (initial_sold_percent >= 0 AND initial_sold_percent <= 100),
  CONSTRAINT fomo_max_sold_check CHECK (max_sold_percent >= 0 AND max_sold_percent <= 100)
);

CREATE TABLE public.fomo_campaign_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.fomo_campaigns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  discount_percent NUMERIC,
  display_sale_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, product_id),
  CONSTRAINT fomo_discount_check CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent < 100)),
  CONSTRAINT fomo_price_check CHECK (display_sale_price IS NULL OR display_sale_price >= 0)
);

GRANT SELECT ON public.fomo_campaigns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fomo_campaigns TO authenticated;
GRANT ALL ON public.fomo_campaigns TO service_role;

GRANT SELECT ON public.fomo_campaign_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fomo_campaign_products TO authenticated;
GRANT ALL ON public.fomo_campaign_products TO service_role;

ALTER TABLE public.fomo_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fomo_campaign_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active campaigns are public" ON public.fomo_campaigns
  FOR SELECT USING (is_active = true);
CREATE POLICY "Staff read campaigns" ON public.fomo_campaigns
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Managers write campaigns" ON public.fomo_campaigns
  FOR ALL TO authenticated USING (public.can_manage_products(auth.uid())) WITH CHECK (public.can_manage_products(auth.uid()));

CREATE POLICY "Campaign products are public" ON public.fomo_campaign_products
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.fomo_campaigns c WHERE c.id = campaign_id AND c.is_active));
CREATE POLICY "Staff read campaign products" ON public.fomo_campaign_products
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Managers write campaign products" ON public.fomo_campaign_products
  FOR ALL TO authenticated USING (public.can_manage_products(auth.uid())) WITH CHECK (public.can_manage_products(auth.uid()));

CREATE TRIGGER fomo_campaigns_touch_updated_at
  BEFORE UPDATE ON public.fomo_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.fomo_campaigns (name, is_active, headline) VALUES ('Evergreen FOMO', false, 'Limited time offer');
