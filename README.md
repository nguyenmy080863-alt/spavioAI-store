# Spavio AI Store

Online store for Spavio AI beauty and personal care devices: LED masks, microcurrent, RF and IPL devices, ionic hair tools and body wellness tech.

Spavio AI "Violet Glam" identity:

- Brand colours `#761DEA` (violet) and `#5346A7` (indigo), soft lilac surfaces, with a dark palette under `.dark`
- Playfair Display for headings, Manrope for body text
- Pill-shaped gradient CTAs, rounded cards, and the Spavio AI lotus wordmark (`src/components/SpavioLogo.tsx`)

## Tech stack

Vite, React 18 and TypeScript, Tailwind CSS with shadcn/ui (Radix), React Router, TanStack Query, i18next, and Supabase (Postgres, auth, storage) with Drizzle for the schema and migrations. PayPal handles payments at checkout. Pages are prerendered to static HTML at build time.

## Getting started

Requires Node.js 18+.

```sh
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build: client bundle, SSR bundle, then prerender of all pages, sitemap and 404 (output in `dist/`) |
| `npm run build:spa` | Client-only build, without prerendering |
| `npm run build:dev` | Build in development mode |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint` | Run ESLint |

With no `.env`, the store runs on the bundled catalog in `src/data/products.ts` and includes a demo "Glow Week" flash sale. Admin, login and saved carts need Supabase.

## Languages & SEO

The store is available in three languages: **German** (default) at `/`, **English** at `/en/` and **Vietnamese** at `/vi/` (e.g. `/product/silk-ipl`, `/en/product/silk-ipl`, `/vi/product/silk-ipl`). `x-default` points to German.

- The language comes from the URL. Links, redirects and the language switcher keep the current language (`src/i18n/LocaleLink.tsx`).
- Every page has a translated title and description (`src/i18n/locales/*/seo.json`), a per-language canonical, `hreflang` alternates (en, de, vi, x-default), `og:locale` and `<html lang>`.
- Product names and descriptions are translated in `src/i18n/locales/*/products.json`, keyed by product slug. Products added later in the admin panel fall back to their stored text until a translation is added.
- `npm run build` prerenders every storefront page in all three languages to static HTML, so crawlers get the full content without JavaScript. It also writes `dist/sitemap.xml` with hreflang alternates, `dist/404.html` for unknown URLs, and `dist/200.html` as the client-only shell for the admin panel.
- Structured data: Organization, WebSite and SearchAction on the homepage, Product and Breadcrumb on product pages, and CollectionPage with an ItemList on category pages.
- Share images for products live in `public/og/products/` (JPG, 1200×630), because social networks can't render SVG.

**Hosting:** serve `dist/` as a static site. `vercel.json` (Vercel) and `public/_redirects` (Netlify) route `/admin/*` to the SPA shell. Every other URL is either a prerendered page or gets `404.html` with a real 404 status.

## Landing-page hero: Spavio Lumipore

The hero (`src/components/content/LumiporeHero.tsx`) features Spavio Lumipore. The device floats gently and cycles through its four light modes (warmth, serum boost, micro-lifting, glow). Visitors can also pick a mode with the buttons, and motion stops when the system asks for reduced motion. The device images (`src/assets/brand/lumipore-*.png`) were cut out of `src/assets/products/lumipore.png`, one per LED colour. If you set a custom banner image in the admin panel's Hero page, it replaces this hero.

`public/media/lumipore-showcase.gif` (720×720, loops) shows the same animation for social media, newsletters or marketplaces. The website itself uses the sharper CSS animation.

## Preorders

Administrators can sell any product as a preorder from **Admin → Products → edit product → Preorder**:

- Switch on **Available for preorder**.
- Choose the **deposit type**, either a fixed amount per unit (EUR) or a percentage of the price, and enter the deposit. It's validated: greater than 0, not above the price, and at most 100%.
- Optionally set the **expected shipping date**.

A live preview shows what the customer pays at checkout and when the product ships. The product list shows a preorder badge with the deposit, and a **Preorder** filter lists all preorder products.

In the store, preorder products get a "Vorbestellung / Preorder" badge. The product page shows the deposit, the balance and the expected shipping date, and the bag and checkout split the total into **due today** (regular items plus deposits plus shipping) and **due at shipping**. Only the amount due today is charged. Search engines see the product as `PreOrder`. Database columns: migration `0010_add_product_preorders.sql`.

Charging the remaining balance when a preorder ships is not automated yet. See the [roadmap](roadmap.md).

## Admin panel

Available at `/admin` once Supabase is connected (the first user can claim Super Admin). It covers products and media, collections, the hero banner, flash sales, inventory, purchase orders, sales orders and deliveries, warranty tickets, returns, discounts, customers and segments, team and roles, an audit log, and a live-view dashboard. Role-based access is enforced with row-level security.

Step-by-step guides for admins and descriptions of the customer flows live in [docs/](docs/README.md). They are also shown inside the admin panel under **Docs**.

## Journal

The Journal (Ratgeber) at `/journal` has beauty-tech guides in German, English and Vietnamese (`src/pages/journal/`). Articles are prerendered and included in the sitemap.

## Connecting Supabase (optional)

1. Copy `.env.example` to `.env` and fill in your project URL and publishable key.
2. Apply the migrations in `drizzle/migrations/` in order (`0000` to `0018`; the schema is in `drizzle/schema.ts`). `0008_seed_spavioai_catalog.sql` seeds the four device categories, all 14 products, and the hero banner copy.
3. Sign up. The first user can claim Super Admin at `/admin`.
4. Rebuild after catalog changes (`npm run build`), so new products get prerendered pages and sitemap entries.

Once Supabase is configured, the storefront reads products, the hero banner and the flash-sale campaign from the database.

## Structure

| Area | Location |
| --- | --- |
| Theme tokens | `src/index.css`, `tailwind.config.ts` |
| Catalog, categories and collections | `src/data/products.ts` |
| Product artwork (SVG) | `src/assets/products/` |
| Brand photography | `src/assets/brand/` |
| Homepage sections | `src/components/content/` |
| Translations (EN / DE / VI) and SEO copy | `src/i18n/locales/` |
| Device guide | `src/pages/about/DeviceGuide.tsx` |
| Storefront pages | `src/pages/` |
| Admin pages | `src/pages/admin/` |
| Journal articles | `src/pages/journal/` |
| Database schema and migrations | `drizzle/` |
| Prerender script | `scripts/prerender.mjs` |
| Docs and roadmap | `docs/`, `roadmap.md` |

Category routes: `/category/skincare-devices`, `/category/hair-removal`, `/category/hair-styling-and-care`, `/category/body-and-wellness`. Collections: `new-in`, `sale`, `best-sellers`, `anti-aging`, `under-100`.
