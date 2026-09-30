import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import enHome from "./locales/en/home.json";
import enShop from "./locales/en/shop.json";
import enAbout from "./locales/en/about.json";
import enLegal from "./locales/en/legal.json";
import enSeo from "./locales/en/seo.json";
import enProducts from "./locales/en/products.json";

import deCommon from "./locales/de/common.json";
import deHome from "./locales/de/home.json";
import deShop from "./locales/de/shop.json";
import deAbout from "./locales/de/about.json";
import deLegal from "./locales/de/legal.json";
import deSeo from "./locales/de/seo.json";
import deProducts from "./locales/de/products.json";

import viCommon from "./locales/vi/common.json";
import viHome from "./locales/vi/home.json";
import viShop from "./locales/vi/shop.json";
import viAbout from "./locales/vi/about.json";
import viLegal from "./locales/vi/legal.json";
import viSeo from "./locales/vi/seo.json";
import viProducts from "./locales/vi/products.json";

export const SUPPORTED_LANGUAGES = [
  { code: "de", label: "Deutsch", short: "DE", ogLocale: "de_DE" },
  { code: "en", label: "English", short: "EN", ogLocale: "en_US" },
  { code: "vi", label: "Tiếng Việt", short: "VI", ogLocale: "vi_VN" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/** German is served without a prefix (/product/x); other languages get one (/en/product/x, /vi/product/x). */
export const DEFAULT_LANGUAGE: LanguageCode = "de";
export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code) as LanguageCode[];

export const isLanguageCode = (value: string | undefined): value is LanguageCode =>
  !!value && (LANGUAGE_CODES as string[]).includes(value);

/** Language encoded in a URL path ("/vi/..." → "vi", anything else → default). */
export const getLangFromPath = (pathname: string): LanguageCode => {
  const first = pathname.split("/")[1];
  return isLanguageCode(first) && first !== DEFAULT_LANGUAGE ? first : DEFAULT_LANGUAGE;
};

/** Path without its language prefix ("/vi/product/x" → "/product/x", "/vi" → "/"). */
export const stripLocale = (pathname: string): string => {
  const lang = getLangFromPath(pathname);
  if (lang === DEFAULT_LANGUAGE) return pathname || "/";
  const rest = pathname.slice(lang.length + 1);
  return rest === "" ? "/" : rest;
};

/** Paths that are never localized (admin panel, external/anchor links). */
const isUnlocalizedPath = (path: string) =>
  !path.startsWith("/") || path.startsWith("//") || path === "/admin" || path.startsWith("/admin/");

/** Add the language prefix to an unprefixed path ("/product/x" + "vi" → "/vi/product/x"). */
export const localizePath = (path: string, lang: LanguageCode): string => {
  if (isUnlocalizedPath(path)) return path;
  const base = stripLocale(path);
  if (lang === DEFAULT_LANGUAGE) return base;
  return base === "/" ? `/${lang}` : `/${lang}${base}`;
};

export const resources = {
  en: { common: enCommon, home: enHome, shop: enShop, about: enAbout, legal: enLegal, seo: enSeo, products: enProducts },
  de: { common: deCommon, home: deHome, shop: deShop, about: deAbout, legal: deLegal, seo: deSeo, products: deProducts },
  vi: { common: viCommon, home: viHome, shop: viShop, about: viAbout, legal: viLegal, seo: viSeo, products: viProducts },
} as const;

const initialLanguage =
  typeof window !== "undefined" ? getLangFromPath(window.location.pathname) : DEFAULT_LANGUAGE;

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: LANGUAGE_CODES,
  defaultNS: "common",
  ns: ["common", "home", "shop", "about", "legal", "seo", "products"],
  interpolation: { escapeValue: false },
  initAsync: false,
  react: { useSuspense: false },
});

if (typeof document !== "undefined") {
  const syncHtmlLang = (lng: string) => {
    document.documentElement.lang = lng;
  };
  syncHtmlLang(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE);
  i18n.on("languageChanged", syncHtmlLang);
}

export default i18n;
