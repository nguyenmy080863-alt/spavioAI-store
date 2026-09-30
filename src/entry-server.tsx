/**
 * Server entry used at build time by scripts/prerender.mjs to turn every storefront
 * route (in every language) into static HTML that search engines can read without JS.
 */
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { HelmetProvider, type HelmetServerState } from "react-helmet-async";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import i18n, { DEFAULT_LANGUAGE, LANGUAGE_CODES, getLangFromPath, localizePath } from "./i18n";
import { AppContent, AppProviders } from "./App";
import { CartProvider } from "./context/CartContext";
import { fetchStorefrontProducts } from "./lib/catalog";
import { fetchHeroBanner } from "./lib/hero";
import { fetchActiveFomoCampaign } from "./lib/fomo";
import { CATEGORIES, COLLECTIONS, categoryToSlug } from "./data/products";

export interface RenderResult {
  html: string;
  head: string;
  htmlAttributes: string;
  state: unknown;
  lang: string;
}

/** Unprefixed storefront paths to prerender (products come from the live catalog). */
export const getIndexablePaths = async (): Promise<string[]> => {
  const products = await fetchStorefrontProducts();
  return [
    "/",
    "/category/shop",
    ...CATEGORIES.map((c) => `/category/${categoryToSlug(c)}`),
    ...Object.keys(COLLECTIONS).map((slug) => `/category/${slug}`),
    ...products.map((p) => `/product/${p.slug}`),
    "/about/our-story",
    "/about/sustainability",
    "/about/device-guide",
    "/about/customer-care",
    "/about/store-locator",
    "/privacy-policy",
    "/terms-of-service",
    "/impressum",
  ];
};

export const languages = LANGUAGE_CODES;
export { DEFAULT_LANGUAGE };
export { localizePath };

const headFrom = (helmet: HelmetServerState | null | undefined) =>
  helmet
    ? [helmet.title, helmet.meta, helmet.link, helmet.script].map((part) => part.toString()).join("\n")
    : "";

export const render = async (url: string): Promise<RenderResult> => {
  const lang = getLangFromPath(url);
  await i18n.changeLanguage(lang);

  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
  await Promise.all([
    queryClient.prefetchQuery({ queryKey: ["storefront-products"], queryFn: fetchStorefrontProducts }),
    queryClient.prefetchQuery({ queryKey: ["hero-banner"], queryFn: fetchHeroBanner }),
    queryClient.prefetchQuery({ queryKey: ["fomo-campaign"], queryFn: fetchActiveFomoCampaign }),
  ]);

  const helmetContext: { helmet?: HelmetServerState | null } = {};
  const html = renderToString(
    <HelmetProvider context={helmetContext}>
      <CartProvider>
        <AppProviders queryClient={queryClient}>
          <StaticRouter location={url}>
            <AppContent />
          </StaticRouter>
        </AppProviders>
      </CartProvider>
    </HelmetProvider>,
  );

  return {
    html,
    head: headFrom(helmetContext.helmet),
    htmlAttributes: helmetContext.helmet?.htmlAttributes.toString() ?? `lang="${lang}"`,
    state: dehydrate(queryClient),
    lang,
  };
};
