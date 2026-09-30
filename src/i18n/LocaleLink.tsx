import { forwardRef, useCallback } from "react";
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  useLocation,
  useNavigate,
  type LinkProps,
  type NavLinkProps,
  type NavigateOptions,
  type To,
} from "react-router-dom";
import { getLangFromPath, localizePath, type LanguageCode } from "@/i18n";

/** Language of the current URL — the single source of truth for the storefront locale. */
export const useLocale = (): LanguageCode => getLangFromPath(useLocation().pathname);

/** Returns a function that prefixes an unprefixed path with the current language. */
export const useLocalizePath = () => {
  const lang = useLocale();
  return useCallback((path: string) => localizePath(path, lang), [lang]);
};

const localizeTo = (to: To, lang: LanguageCode): To => {
  if (typeof to === "string") return localizePath(to, lang);
  if (to.pathname) return { ...to, pathname: localizePath(to.pathname, lang) };
  return to;
};

/** navigate() that keeps the current language. */
export const useLocaleNavigate = () => {
  const navigate = useNavigate();
  const lang = useLocale();
  return useCallback(
    (to: To, options?: NavigateOptions) => navigate(localizeTo(to, lang), options),
    [navigate, lang],
  );
};

/** Drop-in replacement for react-router's Link that keeps the current language. */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(({ to, ...props }, ref) => {
  const lang = useLocale();
  return <RouterLink ref={ref} to={localizeTo(to, lang)} {...props} />;
});
Link.displayName = "LocaleLink";

/** Drop-in replacement for react-router's NavLink that keeps the current language. */
export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(({ to, ...props }, ref) => {
  const lang = useLocale();
  return <RouterNavLink ref={ref} to={localizeTo(to, lang)} {...props} />;
});
NavLink.displayName = "LocaleNavLink";
