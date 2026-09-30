CREATE TABLE public.hero_banner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  eyebrow text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT 'Effortless Lashes',
  subtitle text NOT NULL DEFAULT 'Hand-finished wispy lashes, made to be worn on repeat',
  cta_label text NOT NULL DEFAULT 'Shop lashes',
  cta_href text NOT NULL DEFAULT '/category/essentials',
  image_alt text NOT NULL DEFAULT 'Spavio AI lash collection',
  storage_path text,
  image_url text,
  overlay_opacity numeric NOT NULL DEFAULT 0.35,
  text_align text NOT NULL DEFAULT 'left',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hero_banner TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hero_banner TO authenticated;
GRANT ALL ON public.hero_banner TO service_role;

ALTER TABLE public.hero_banner ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hero banner is publicly readable"
ON public.hero_banner FOR SELECT
USING (true);

CREATE POLICY "Product managers can insert hero banner"
ON public.hero_banner FOR INSERT TO authenticated
WITH CHECK (public.can_manage_products(auth.uid()));

CREATE POLICY "Product managers can update hero banner"
ON public.hero_banner FOR UPDATE TO authenticated
USING (public.can_manage_products(auth.uid()))
WITH CHECK (public.can_manage_products(auth.uid()));

CREATE POLICY "Admins can delete hero banner"
ON public.hero_banner FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

INSERT INTO public.hero_banner (eyebrow, title, subtitle) VALUES
  ('New season', 'Effortless Lashes', 'Hand-finished wispy lashes, made to be worn on repeat');