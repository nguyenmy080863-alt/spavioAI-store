-- Spavio Lumipore 4-in-1: featured in the landing-page hero.
INSERT INTO public.products (slug, name, sku, category, effect, description, editors_notes, price, sale_price, stock, is_new, status, position) VALUES
  ('lumipore', 'Spavio Lumipore 4-in-1', 'SPV-LUMIPORE-15', 'Skincare Devices', '4 Light Modes: Warmth, Serum Boost, Micro-Lifting, Glow', 'One device, four care modes for a spa feeling at home: red light with gentle warmth for a fresh, rosy complexion; green light with microcurrent to help serums and creams absorb; blue light with EMS pulses for firmer-looking skin; and yellow light to soothe and restore radiance.', '"Four light modes in one slim wand — the easiest way to start a device routine."', 111, 89, 50, true, 'published', -1)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.product_images (product_id, asset_key, position)
SELECT p.id, 'lumipore', 0
FROM public.products p
WHERE p.slug = 'lumipore'
  AND NOT EXISTS (SELECT 1 FROM public.product_images i WHERE i.product_id = p.id);
