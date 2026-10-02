-- Products: translations and collections managed in the admin panel. Safe to run more than once.
--
-- TRANSLATIONS. Name, effect, description and editor's notes per language (de / en / vi). They used
-- to live only in code (src/i18n/locales/*/products.json, keyed by the product address), so a
-- product created in the admin panel had no translations. The storefront now uses, per field:
-- database translation > the text in code (for the seeded products) > the product's own text.
--
-- COLLECTIONS. Hand-picked lists of products with a title per language, reachable at
-- /category/<slug>. "best-sellers" and "anti-aging" used to be fixed lists of product addresses in
-- code; they are seeded here from those lists so the admin panel can edit them. The code-driven ones
-- (new-in, sale, under-100) stay automatic, and the four categories stay as they are.

CREATE TABLE IF NOT EXISTS public.product_translations (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  lang TEXT NOT NULL CHECK (lang IN ('de', 'en', 'vi')),
  name TEXT NOT NULL DEFAULT '',
  effect TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  editors_notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, lang)
);

DROP TRIGGER IF EXISTS product_translations_touch_updated_at ON public.product_translations;
CREATE TRIGGER product_translations_touch_updated_at BEFORE UPDATE ON public.product_translations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT ON public.product_translations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_translations TO authenticated;
GRANT ALL ON public.product_translations TO service_role;
ALTER TABLE public.product_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Translations of published products are public" ON public.product_translations;
CREATE POLICY "Translations of published products are public" ON public.product_translations
  FOR SELECT TO anon, authenticated USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.products p
               WHERE p.id = product_id AND p.status = 'published' AND p.archived_at IS NULL)
  );
DROP POLICY IF EXISTS "Managers write translations" ON public.product_translations;
CREATE POLICY "Managers write translations" ON public.product_translations
  FOR ALL TO authenticated
  USING (public.can_manage_products(auth.uid())) WITH CHECK (public.can_manage_products(auth.uid()));

CREATE TABLE IF NOT EXISTS public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND slug NOT IN ('shop', 'new-in', 'sale', 'under-100',
                     'skincare-devices', 'hair-removal', 'hair-styling-and-care', 'body-and-wellness')
  ),
  title_de TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  title_vi TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS collections_touch_updated_at ON public.collections;
CREATE TRIGGER collections_touch_updated_at BEFORE UPDATE ON public.collections
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.collection_products (
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX IF NOT EXISTS collection_products_product_idx ON public.collection_products (product_id);

GRANT SELECT ON public.collections, public.collection_products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.collections, public.collection_products TO authenticated;
GRANT ALL ON public.collections, public.collection_products TO service_role;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active collections are public" ON public.collections;
CREATE POLICY "Active collections are public" ON public.collections
  FOR SELECT TO anon, authenticated USING (active OR public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Managers write collections" ON public.collections;
CREATE POLICY "Managers write collections" ON public.collections
  FOR ALL TO authenticated
  USING (public.can_manage_products(auth.uid())) WITH CHECK (public.can_manage_products(auth.uid()));

DROP POLICY IF EXISTS "Members of active collections are public" ON public.collection_products;
CREATE POLICY "Members of active collections are public" ON public.collection_products
  FOR SELECT TO anon, authenticated USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.active)
  );
DROP POLICY IF EXISTS "Managers write collection products" ON public.collection_products;
CREATE POLICY "Managers write collection products" ON public.collection_products
  FOR ALL TO authenticated
  USING (public.can_manage_products(auth.uid())) WITH CHECK (public.can_manage_products(auth.uid()));

-- Seed the two curated lists that used to be hard-coded (titles come from the existing translations).
-- Only the first time: running this file again must not bring removed products back.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.collections WHERE slug IN ('best-sellers', 'anti-aging')) THEN
    INSERT INTO public.collections (slug) VALUES ('best-sellers'), ('anti-aging');

    INSERT INTO public.collection_products (collection_id, product_id, position)
    SELECT c.id, p.id, m.pos
    FROM (VALUES
      ('best-sellers', 'lumipore', 1), ('best-sellers', 'lumina-led-mask', 2), ('best-sellers', 'silk-ipl', 3),
      ('best-sellers', 'aura-ionic-dryer', 4), ('best-sellers', 'sculpt-microcurrent', 5),
      ('best-sellers', 'sonic-cleanse-brush', 6), ('best-sellers', 'thermalift-rf', 7),
      ('anti-aging', 'lumipore', 1), ('anti-aging', 'lumina-led-mask', 2), ('anti-aging', 'sculpt-microcurrent', 3),
      ('anti-aging', 'thermalift-rf', 4), ('anti-aging', 'aqua-ion-infuser', 5), ('anti-aging', 'eye-revive-wand', 6),
      ('anti-aging', 'contour-body-sculptor', 7)
    ) AS m(collection_slug, product_slug, pos)
    JOIN public.collections c ON c.slug = m.collection_slug
    JOIN public.products p ON p.slug = m.product_slug;
  END IF;
END $$;
