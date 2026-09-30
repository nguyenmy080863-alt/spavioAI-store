import lumiporeImage from "@/assets/products/lumipore-product.jpg";
import ledMaskImage from "@/assets/products/lumina-led-mask.svg";
import microcurrentImage from "@/assets/products/sculpt-microcurrent.svg";
import sonicBrushImage from "@/assets/products/sonic-cleanse-brush.svg";
import rfImage from "@/assets/products/thermalift-rf.svg";
import ionInfuserImage from "@/assets/products/aqua-ion-infuser.svg";
import eyeWandImage from "@/assets/products/eye-revive-wand.svg";
import iplImage from "@/assets/products/silk-ipl.svg";
import trimmerImage from "@/assets/products/precision-trimmer.svg";
import dryerImage from "@/assets/products/aura-ionic-dryer.svg";
import straightenerImage from "@/assets/products/glide-straightener.svg";
import scalpImage from "@/assets/products/scalp-revive.svg";
import massagerImage from "@/assets/products/pulse-mini-massager.svg";
import bodySculptorImage from "@/assets/products/contour-body-sculptor.svg";
import cryoImage from "@/assets/products/cryo-glow-roller.svg";
import collectionImage from "@/assets/products/collection.svg";
import heroImage from "@/assets/brand/hero-clinic.jpg";
import type { PreorderConfig } from "@/lib/preorder";

export { collectionImage, heroImage };

export const CATEGORIES = [
  "Skincare Devices",
  "Hair Removal",
  "Hair Styling & Care",
  "Body & Wellness",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const categoryToSlug = (category: string) =>
  category.toLowerCase().replace(/&/g, "and").replace(/\s+/g, "-");

export const slugToCategory = (slug: string): Category | undefined =>
  CATEGORIES.find((c) => categoryToSlug(c) === slug);

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  isNew?: boolean;
  effect: string;
  description: string;
  editorsNotes: string;
  stock?: number;
  salePrice?: number | null;
  /** Set when the product is sold as a preorder (deposit now, balance at shipping). */
  preorder?: PreorderConfig | null;
}

/** Bundled artwork for the seeded catalog, keyed by the DB `asset_key`. */
export const LOCAL_ASSETS: Record<string, string> = {
  lumipore: lumiporeImage,
  "lumina-led-mask": ledMaskImage,
  "sculpt-microcurrent": microcurrentImage,
  "sonic-cleanse-brush": sonicBrushImage,
  "thermalift-rf": rfImage,
  "aqua-ion-infuser": ionInfuserImage,
  "eye-revive-wand": eyeWandImage,
  "silk-ipl": iplImage,
  "precision-trimmer": trimmerImage,
  "aura-ionic-dryer": dryerImage,
  "glide-straightener": straightenerImage,
  "scalp-revive": scalpImage,
  "pulse-mini-massager": massagerImage,
  "contour-body-sculptor": bodySculptorImage,
  "cryo-glow-roller": cryoImage,
  collection: collectionImage,
};

export const products: Product[] = [
  /* Skincare Devices */
  {
    id: "lumipore",
    name: "Spavio Lumipore 4-in-1",
    category: "Skincare Devices",
    price: 111,
    salePrice: 89,
    image: lumiporeImage,
    isNew: true,
    effect: "4 Light Modes: Warmth, Serum Boost, Micro-Lifting, Glow",
    description:
      "One device, four care modes for a spa feeling at home: red light with gentle warmth for a fresh, rosy complexion; green light with microcurrent to help serums and creams absorb; blue light with EMS pulses for firmer-looking skin; and yellow light to soothe and restore radiance.",
    editorsNotes:
      "\"Four light modes in one slim wand — the easiest way to start a device routine.\"",
    stock: 50,
  },
  {
    id: "lumina-led-mask",
    name: "Lumina Pro LED Face Mask",
    category: "Skincare Devices",
    price: 289,
    salePrice: 249,
    image: ledMaskImage,
    isNew: true,
    effect: "Red & Near-Infrared Light Therapy",
    description:
      "A flexible, medical-grade silicone mask with 160 LEDs delivering red (630nm) and near-infrared (830nm) light to support collagen, even tone and calm redness in just 10 minutes a day.",
    editorsNotes:
      "\"The easiest glow ritual we know — put it on, press play, and let the light do the work.\"",
    stock: 24,
  },
  {
    id: "sculpt-microcurrent",
    name: "Sculpt Microcurrent Toning Device",
    category: "Skincare Devices",
    price: 219,
    image: microcurrentImage,
    isNew: true,
    effect: "Lift & Contour",
    description:
      "Twin rotating spheres deliver gentle microcurrent to tone facial muscles along the jawline, cheekbones and brows. Five intensity levels and a guided 5-minute routine.",
    editorsNotes:
      "\"A five-minute facial workout that visibly sharpens your contours before an event.\"",
    stock: 18,
  },
  {
    id: "thermalift-rf",
    name: "ThermaLift RF Skin Tightener",
    category: "Skincare Devices",
    price: 249,
    image: rfImage,
    isNew: false,
    effect: "Radiofrequency Firming",
    description:
      "Multipolar radiofrequency warms the deeper layers of the skin to a comfortable 40–42°C, with built-in temperature sensing that keeps every session safe and consistent.",
    editorsNotes:
      "\"Clinic-style firming, calibrated for home. The smart sensor makes it effortless.\"",
    stock: 15,
  },
  {
    id: "sonic-cleanse-brush",
    name: "Sonic Cleanse Facial Brush",
    category: "Skincare Devices",
    price: 89,
    image: sonicBrushImage,
    isNew: false,
    effect: "Deep Pore Cleansing",
    description:
      "Ultra-soft, hygienic silicone touch-points pulse at 8,000 sonic vibrations per minute to lift away makeup, SPF and impurities — gentle enough for twice-daily use.",
    editorsNotes:
      "\"Cleaner skin in 60 seconds. Waterproof, travel-ready and a single charge lasts for months.\"",
    stock: 40,
  },
  {
    id: "aqua-ion-infuser",
    name: "Aqua Ion Serum Infuser",
    category: "Skincare Devices",
    price: 129,
    image: ionInfuserImage,
    isNew: true,
    effect: "Ultrasonic Product Absorption",
    description:
      "Ultrasonic vibration and ionic modes help your favourite serums and moisturisers work into the skin, while the cool-touch stainless head soothes and de-puffs.",
    editorsNotes:
      "\"Make every drop of serum count — a quiet upgrade to your existing routine.\"",
    stock: 30,
  },
  {
    id: "eye-revive-wand",
    name: "Eye Revive Heated Massager",
    category: "Skincare Devices",
    price: 79,
    image: eyeWandImage,
    isNew: false,
    effect: "De-Puff & Brighten",
    description:
      "A pen-sized wand with a warming 42°C tip and gentle sonic pulses that relax the delicate eye area and help eye creams absorb.",
    editorsNotes:
      "\"Our morning secret for brighter, less tired-looking eyes.\"",
    stock: 35,
  },
  {
    id: "cryo-glow-roller",
    name: "Cryo Glow Ice Roller",
    category: "Skincare Devices",
    price: 39,
    image: cryoImage,
    isNew: false,
    effect: "Cooling & Soothing",
    description:
      "A stainless-steel cryo roller that stays cold for up to 20 minutes after chilling. Calms redness, tightens the look of pores and pairs perfectly with post-treatment care.",
    editorsNotes:
      "\"Keep it in the fridge — two minutes of rolling feels like a spa reset.\"",
    stock: 60,
  },

  /* Hair Removal */
  {
    id: "silk-ipl",
    name: "Silk IPL Hair Removal",
    category: "Hair Removal",
    price: 349,
    salePrice: 299,
    image: iplImage,
    isNew: true,
    effect: "Long-Lasting Smoothness",
    description:
      "Intense pulsed light with an integrated skin-tone sensor and five energy levels. Visible hair reduction in as few as four weekly sessions, with an ice-cool sapphire window for comfort.",
    editorsNotes:
      "\"Salon-level IPL at home, with the sensor doing the guesswork for you.\"",
    stock: 12,
  },
  {
    id: "precision-trimmer",
    name: "Precision Face & Brow Trimmer",
    category: "Hair Removal",
    price: 39,
    image: trimmerImage,
    isNew: false,
    effect: "Painless Detailing",
    description:
      "A slim, whisper-quiet trimmer with five interchangeable heads for brows, upper lip, face and fine body hair. Hypoallergenic blades for sensitive skin.",
    editorsNotes: "\"The detail tool everyone should have in their vanity.\"",
    stock: 80,
  },

  /* Hair Styling & Care */
  {
    id: "aura-ionic-dryer",
    name: "Aura Ionic Hair Dryer",
    category: "Hair Styling & Care",
    price: 199,
    image: dryerImage,
    isNew: true,
    effect: "Fast Dry, Frizz Control",
    description:
      "A 110,000 RPM brushless motor with 200 million negative ions per cm³ for quick, glossy blow-dries. Intelligent heat control measures air temperature 40 times per second.",
    editorsNotes:
      "\"Lightweight, powerful and quiet — a salon blow-dry without the heat damage.\"",
    stock: 20,
  },
  {
    id: "glide-straightener",
    name: "Glide Infrared Straightener",
    category: "Hair Styling & Care",
    price: 129,
    image: straightenerImage,
    isNew: false,
    effect: "Smooth & Shine",
    description:
      "Floating ceramic plates infused with infrared technology heat evenly from 150–230°C for sleek, shiny results in a single pass. Auto shut-off after 60 minutes.",
    editorsNotes: "\"Straightens, curls and waves — one tool for every look.\"",
    stock: 26,
  },
  {
    id: "scalp-revive",
    name: "Scalp Revive Massager",
    category: "Hair Styling & Care",
    price: 69,
    image: scalpImage,
    isNew: false,
    effect: "Scalp Care & Relaxation",
    description:
      "Waterproof, rotating kneading nodes and red-light therapy stimulate the scalp, support circulation and turn your hair-wash into a mini head spa.",
    editorsNotes: "\"Ten minutes of pure relaxation — and your scalp will thank you.\"",
    stock: 45,
  },

  /* Body & Wellness */
  {
    id: "pulse-mini-massager",
    name: "Pulse Mini Massage Gun",
    category: "Body & Wellness",
    price: 139,
    image: massagerImage,
    isNew: false,
    effect: "Muscle Recovery",
    description:
      "Compact percussion therapy with four speeds and four attachments. Relieves tension in neck, shoulders and legs — small enough for any handbag.",
    editorsNotes: "\"Powerful relief that fits in the palm of your hand.\"",
    stock: 33,
  },
  {
    id: "contour-body-sculptor",
    name: "Contour Body Sculptor",
    category: "Body & Wellness",
    price: 179,
    image: bodySculptorImage,
    isNew: true,
    effect: "EMS + RF Body Toning",
    description:
      "Combines EMS muscle stimulation with warming radiofrequency and triple rolling heads to smooth and firm the look of thighs, arms and abdomen.",
    editorsNotes: "\"A body-contouring ritual that feels like a warm, deep massage.\"",
    stock: 16,
  },
];

/** Curated, non-category collections reachable at /category/:slug. */
export const COLLECTIONS: Record<string, (p: Product) => boolean> = {
  "new-in": (p) => Boolean(p.isNew),
  sale: (p) => p.salePrice != null && p.salePrice < p.price,
  "best-sellers": (p) =>
    ["lumipore", "lumina-led-mask", "silk-ipl", "aura-ionic-dryer", "sculpt-microcurrent", "sonic-cleanse-brush", "thermalift-rf"].includes(p.id),
  "anti-aging": (p) =>
    ["lumipore", "lumina-led-mask", "sculpt-microcurrent", "thermalift-rf", "aqua-ion-infuser", "eye-revive-wand", "contour-body-sculptor"].includes(p.id),
  "under-100": (p) => (p.salePrice ?? p.price) < 100,
};

export const getProduct = (id: string | undefined) =>
  products.find((p) => p.id === id);

export const getRelated = (product: Product, count = 6) =>
  products.filter((p) => p.id !== product.id).slice(0, count);

export const formatPrice = (value: number) =>
  `€${value.toLocaleString("en-IE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
