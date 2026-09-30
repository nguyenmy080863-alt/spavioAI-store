-- Spavio AI Store: seed the beauty-device catalog and rebrand the hero banner defaults.
-- Product images use bundled artwork via asset_key (see LOCAL_ASSETS in src/data/products.ts).

INSERT INTO public.categories (name, slug, position) VALUES
  ('Skincare Devices', 'skincare-devices', 0),
  ('Hair Removal', 'hair-removal', 1),
  ('Hair Styling & Care', 'hair-styling-and-care', 2),
  ('Body & Wellness', 'body-and-wellness', 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (slug, name, sku, category, effect, description, editors_notes, price, sale_price, stock, is_new, status, position) VALUES
  ('lumina-led-mask', 'Lumina Pro LED Face Mask', 'SPV-LUMINALEDM-01', 'Skincare Devices', 'Red & Near-Infrared Light Therapy', 'A flexible, medical-grade silicone mask with 160 LEDs delivering red (630nm) and near-infrared (830nm) light to support collagen, even tone and calm redness in just 10 minutes a day.', '"The easiest glow ritual we know — put it on, press play, and let the light do the work."', 289, 249, 24, true, 'published', 0),
  ('sculpt-microcurrent', 'Sculpt Microcurrent Toning Device', 'SPV-SCULPTMICR-02', 'Skincare Devices', 'Lift & Contour', 'Twin rotating spheres deliver gentle microcurrent to tone facial muscles along the jawline, cheekbones and brows. Five intensity levels and a guided 5-minute routine.', '"A five-minute facial workout that visibly sharpens your contours before an event."', 219, NULL, 18, true, 'published', 1),
  ('thermalift-rf', 'ThermaLift RF Skin Tightener', 'SPV-THERMALIFT-03', 'Skincare Devices', 'Radiofrequency Firming', 'Multipolar radiofrequency warms the deeper layers of the skin to a comfortable 40–42°C, with built-in temperature sensing that keeps every session safe and consistent.', '"Clinic-style firming, calibrated for home. The smart sensor makes it effortless."', 249, NULL, 15, false, 'published', 2),
  ('sonic-cleanse-brush', 'Sonic Cleanse Facial Brush', 'SPV-SONICCLEAN-04', 'Skincare Devices', 'Deep Pore Cleansing', 'Ultra-soft, hygienic silicone touch-points pulse at 8,000 sonic vibrations per minute to lift away makeup, SPF and impurities — gentle enough for twice-daily use.', '"Cleaner skin in 60 seconds. Waterproof, travel-ready and a single charge lasts for months."', 89, NULL, 40, false, 'published', 3),
  ('aqua-ion-infuser', 'Aqua Ion Serum Infuser', 'SPV-AQUAIONINF-05', 'Skincare Devices', 'Ultrasonic Product Absorption', 'Ultrasonic vibration and ionic modes help your favourite serums and moisturisers work into the skin, while the cool-touch stainless head soothes and de-puffs.', '"Make every drop of serum count — a quiet upgrade to your existing routine."', 129, NULL, 30, true, 'published', 4),
  ('eye-revive-wand', 'Eye Revive Heated Massager', 'SPV-EYEREVIVEW-06', 'Skincare Devices', 'De-Puff & Brighten', 'A pen-sized wand with a warming 42°C tip and gentle sonic pulses that relax the delicate eye area and help eye creams absorb.', '"Our morning secret for brighter, less tired-looking eyes."', 79, NULL, 35, false, 'published', 5),
  ('cryo-glow-roller', 'Cryo Glow Ice Roller', 'SPV-CRYOGLOWRO-07', 'Skincare Devices', 'Cooling & Soothing', 'A stainless-steel cryo roller that stays cold for up to 20 minutes after chilling. Calms redness, tightens the look of pores and pairs perfectly with post-treatment care.', '"Keep it in the fridge — two minutes of rolling feels like a spa reset."', 39, NULL, 60, false, 'published', 6),
  ('silk-ipl', 'Silk IPL Hair Removal', 'SPV-SILKIPL-08', 'Hair Removal', 'Long-Lasting Smoothness', 'Intense pulsed light with an integrated skin-tone sensor and five energy levels. Visible hair reduction in as few as four weekly sessions, with an ice-cool sapphire window for comfort.', '"Salon-level IPL at home, with the sensor doing the guesswork for you."', 349, 299, 12, true, 'published', 7),
  ('precision-trimmer', 'Precision Face & Brow Trimmer', 'SPV-PRECISIONT-09', 'Hair Removal', 'Painless Detailing', 'A slim, whisper-quiet trimmer with five interchangeable heads for brows, upper lip, face and fine body hair. Hypoallergenic blades for sensitive skin.', '"The detail tool everyone should have in their vanity."', 39, NULL, 80, false, 'published', 8),
  ('aura-ionic-dryer', 'Aura Ionic Hair Dryer', 'SPV-AURAIONICD-10', 'Hair Styling & Care', 'Fast Dry, Frizz Control', 'A 110,000 RPM brushless motor with 200 million negative ions per cm³ for quick, glossy blow-dries. Intelligent heat control measures air temperature 40 times per second.', '"Lightweight, powerful and quiet — a salon blow-dry without the heat damage."', 199, NULL, 20, true, 'published', 9),
  ('glide-straightener', 'Glide Infrared Straightener', 'SPV-GLIDESTRAI-11', 'Hair Styling & Care', 'Smooth & Shine', 'Floating ceramic plates infused with infrared technology heat evenly from 150–230°C for sleek, shiny results in a single pass. Auto shut-off after 60 minutes.', '"Straightens, curls and waves — one tool for every look."', 129, NULL, 26, false, 'published', 10),
  ('scalp-revive', 'Scalp Revive Massager', 'SPV-SCALPREVIV-12', 'Hair Styling & Care', 'Scalp Care & Relaxation', 'Waterproof, rotating kneading nodes and red-light therapy stimulate the scalp, support circulation and turn your hair-wash into a mini head spa.', '"Ten minutes of pure relaxation — and your scalp will thank you."', 69, NULL, 45, false, 'published', 11),
  ('pulse-mini-massager', 'Pulse Mini Massage Gun', 'SPV-PULSEMINIM-13', 'Body & Wellness', 'Muscle Recovery', 'Compact percussion therapy with four speeds and four attachments. Relieves tension in neck, shoulders and legs — small enough for any handbag.', '"Powerful relief that fits in the palm of your hand."', 139, NULL, 33, false, 'published', 12),
  ('contour-body-sculptor', 'Contour Body Sculptor', 'SPV-CONTOURBOD-14', 'Body & Wellness', 'EMS + RF Body Toning', 'Combines EMS muscle stimulation with warming radiofrequency and triple rolling heads to smooth and firm the look of thighs, arms and abdomen.', '"A body-contouring ritual that feels like a warm, deep massage."', 179, NULL, 16, true, 'published', 13)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.product_images (product_id, asset_key, position)
SELECT p.id, p.slug, 0
FROM public.products p
WHERE p.slug IN ('lumina-led-mask', 'sculpt-microcurrent', 'thermalift-rf', 'sonic-cleanse-brush', 'aqua-ion-infuser', 'eye-revive-wand', 'cryo-glow-roller', 'silk-ipl', 'precision-trimmer', 'aura-ionic-dryer', 'glide-straightener', 'scalp-revive', 'pulse-mini-massager', 'contour-body-sculptor')
  AND NOT EXISTS (SELECT 1 FROM public.product_images i WHERE i.product_id = p.id);

ALTER TABLE public.hero_banner ALTER COLUMN title SET DEFAULT 'Clinic-Grade Beauty, At Home';
ALTER TABLE public.hero_banner ALTER COLUMN subtitle SET DEFAULT 'LED, microcurrent, RF and IPL devices — curated with beauty professionals for results you can see.';
ALTER TABLE public.hero_banner ALTER COLUMN cta_label SET DEFAULT 'Shop devices';
ALTER TABLE public.hero_banner ALTER COLUMN cta_href SET DEFAULT '/category/shop';
ALTER TABLE public.hero_banner ALTER COLUMN image_alt SET DEFAULT 'Spavio AI Store — smart beauty devices';

UPDATE public.hero_banner
SET eyebrow = 'Spavio AI Beauty Tech',
    title = 'Clinic-Grade Beauty, At Home',
    subtitle = 'LED, microcurrent, RF and IPL devices — curated with beauty professionals for results you can see.',
    cta_label = 'Shop devices',
    cta_href = '/category/shop',
    image_alt = 'Spavio AI Store — smart beauty devices',
    updated_at = now()
WHERE title = 'Effortless Lashes';
