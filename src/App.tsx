import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ScrollToTop from "./components/ScrollToTop";
import Index from "./pages/Index";
import Category from "./pages/Category";
import ProductDetail from "./pages/ProductDetail";
import Checkout from "./pages/Checkout";
import NotFound from "./pages/NotFound";
import OurStory from "./pages/about/OurStory";
import Sustainability from "./pages/about/Sustainability";
import DeviceGuide from "./pages/about/DeviceGuide";
import CustomerCare from "./pages/about/CustomerCare";
import StoreLocator from "./pages/about/StoreLocator";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import AdminLayout from "./components/admin/AdminLayout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Account from "./pages/Account";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminProductForm from "./pages/admin/AdminProductForm";
import AdminTeam from "./pages/admin/AdminTeam";
import AdminAuditLog from "./pages/admin/AdminAuditLog";
import AdminFomo from "./pages/admin/AdminFomo";
import AdminHero from "./pages/admin/AdminHero";
import Impressum from "./pages/Impressum";
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, type LanguageCode } from "./i18n";
import { useLocalizePath } from "./i18n/LocaleLink";
import { ConsentProvider } from "./context/ConsentContext";
import CookieConsent from "./components/CookieConsent";
import WhatsAppButton from "./components/WhatsAppButton";

/** Keeps i18next in sync with the language segment of the URL. */
const LocaleLayout = ({ lang }: { lang: LanguageCode }) => {
  const { i18n } = useTranslation();
  useEffect(() => {
    if (i18n.language !== lang) void i18n.changeLanguage(lang);
  }, [i18n, lang]);
  return (
    <>
      <Outlet />
      <CookieConsent />
      <WhatsAppButton />
    </>
  );
};

const LocaleRedirect = ({ to }: { to: string }) => {
  const localize = useLocalizePath();
  return <Navigate to={localize(to)} replace />;
};

/** Storefront pages; mounted once per language ("/" for English, "/vi" for Vietnamese). */
const storefrontRoutes = (
  <>
    <Route index element={<Index />} />
    <Route path="category/:category" element={<Category />} />
    <Route path="product/:productId" element={<ProductDetail />} />
    <Route path="checkout" element={<Checkout />} />
    <Route path="about" element={<LocaleRedirect to="/about/our-story" />} />
    <Route path="about/our-story" element={<OurStory />} />
    <Route path="about/sustainability" element={<Sustainability />} />
    <Route path="about/device-guide" element={<DeviceGuide />} />
    <Route path="about/size-guide" element={<LocaleRedirect to="/about/device-guide" />} />
    <Route path="about/customer-care" element={<CustomerCare />} />
    <Route path="about/store-locator" element={<StoreLocator />} />
    <Route path="privacy-policy" element={<PrivacyPolicy />} />
    <Route path="terms-of-service" element={<TermsOfService />} />
    <Route path="impressum" element={<Impressum />} />
    <Route path="login" element={<Login />} />
    <Route path="signup" element={<Signup />} />
    <Route path="account" element={<Account />} />
    <Route path="*" element={<NotFound />} />
  </>
);

export const AppRoutes = () => (
  <Routes>
    {LANGUAGE_CODES.map((lang) => (
      <Route
        key={lang}
        path={lang === DEFAULT_LANGUAGE ? "/" : `/${lang}`}
        element={<LocaleLayout lang={lang} />}
      >
        {storefrontRoutes}
      </Route>
    ))}
    <Route path="/admin/login" element={<Navigate to="/login" replace />} />
    <Route path="/admin" element={<AdminLayout />}>
      <Route index element={<AdminDashboard />} />
      <Route path="products" element={<AdminProducts />} />
      <Route path="products/new" element={<AdminProductForm />} />
      <Route path="products/:productId" element={<AdminProductForm />} />
      <Route path="fomo" element={<AdminFomo />} />
      <Route path="hero" element={<AdminHero />} />
      <Route path="team" element={<AdminTeam />} />
      <Route path="audit-log" element={<AdminAuditLog />} />
    </Route>
  </Routes>
);

/** Providers shared by the browser entry (main.tsx) and the prerenderer (entry-server.tsx). */
export const AppProviders = ({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {children}
    </TooltipProvider>
  </QueryClientProvider>
);

/** Everything inside the router. */
export const AppContent = () => (
  <AdminAuthProvider>
    <ConsentProvider>
      <ScrollToTop />
      <AppRoutes />
    </ConsentProvider>
  </AdminAuthProvider>
);
