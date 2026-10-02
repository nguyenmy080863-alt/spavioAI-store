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
import JournalIndex from "./pages/journal/JournalIndex";
import JournalArticle from "./pages/journal/JournalArticle";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import AdminLayout from "./components/admin/AdminLayout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Account from "./pages/Account";
import DiscountLink from "./pages/DiscountLink";
import AccountOrders from "./pages/AccountOrders";
import OrderTrack from "./pages/OrderTrack";
import ReturnRequest from "./pages/returns/ReturnRequest";
import ReturnTrack from "./pages/returns/ReturnTrack";
import WarrantyRequest from "./pages/warranty/WarrantyRequest";
import WarrantyTrack from "./pages/warranty/WarrantyTrack";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminProductForm from "./pages/admin/AdminProductForm";
import AdminTeam from "./pages/admin/AdminTeam";
import AdminCollections from "./pages/admin/AdminCollections";
import AdminInventory from "./pages/admin/AdminInventory";
import AdminDocs from "./pages/admin/AdminDocs";
import AdminPurchaseOrders from "./pages/admin/AdminPurchaseOrders";
import AdminPurchaseOrderDetail from "./pages/admin/AdminPurchaseOrderDetail";
import AdminSalesOrders from "./pages/admin/AdminSalesOrders";
import AdminSalesOrderDetail from "./pages/admin/AdminSalesOrderDetail";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminCustomerDetail from "./pages/admin/AdminCustomerDetail";
import AdminDiscounts from "./pages/admin/AdminDiscounts";
import AdminDiscountForm from "./pages/admin/AdminDiscountForm";
import AdminFinance from "./pages/admin/AdminFinance";
import AdminReturns from "./pages/admin/AdminReturns";
import AdminReturnDetail from "./pages/admin/AdminReturnDetail";
import AdminWarranty from "./pages/admin/AdminWarranty";
import AdminWarrantyDetail from "./pages/admin/AdminWarrantyDetail";
import AdminPlaceholder from "./pages/admin/AdminPlaceholder";
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
    <Route path="journal" element={<JournalIndex />} />
    <Route path="journal/:slug" element={<JournalArticle />} />
    <Route path="privacy-policy" element={<PrivacyPolicy />} />
    <Route path="terms-of-service" element={<TermsOfService />} />
    <Route path="impressum" element={<Impressum />} />
    <Route path="login" element={<Login />} />
    <Route path="signup" element={<Signup />} />
    <Route path="account" element={<Account />} />
    <Route path="discount/:code" element={<DiscountLink />} />
    <Route path="account/orders" element={<AccountOrders />} />
    <Route path="orders/track" element={<OrderTrack />} />
    <Route path="returns" element={<ReturnRequest />} />
    <Route path="returns/track" element={<ReturnTrack />} />
    <Route path="warranty" element={<WarrantyRequest />} />
    <Route path="warranty/track" element={<WarrantyTrack />} />
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
      <Route index element={<AdminOverview />} />
      <Route path="products" element={<AdminProducts />} />
      <Route path="products/new" element={<AdminProductForm />} />
      <Route path="products/:productId" element={<AdminProductForm />} />
      <Route path="fomo" element={<Navigate to="/admin/discounts/flash-sale" replace />} />
      <Route path="discounts/flash-sale" element={<AdminFomo />} />
      <Route path="hero" element={<AdminHero />} />
      <Route path="team" element={<AdminTeam />} />
      <Route path="audit-log" element={<AdminAuditLog />} />
      <Route path="docs" element={<AdminDocs />} />
      <Route path="docs/:group" element={<AdminDocs />} />
      <Route path="docs/:group/:slug" element={<AdminDocs />} />
      <Route path="orders" element={<AdminSalesOrders />} />
      <Route path="orders/:orderId" element={<AdminSalesOrderDetail />} />
      <Route path="orders/drafts" element={<AdminPlaceholder />} />
      <Route path="orders/shipping-labels" element={<AdminPlaceholder />} />
      <Route path="products/categories" element={<AdminCollections />} />
      <Route path="products/inventory" element={<AdminInventory />} />
      <Route path="products/purchase-orders" element={<AdminPurchaseOrders />} />
      <Route path="products/purchase-orders/:poId" element={<AdminPurchaseOrderDetail />} />
      <Route path="products/transfers" element={<AdminPlaceholder />} />
      <Route path="products/gift-cards" element={<AdminPlaceholder />} />
      <Route path="customers" element={<AdminCustomers />} />
      <Route path="customers/:customerId" element={<AdminCustomerDetail />} />
      <Route path="discounts" element={<AdminDiscounts />} />
      <Route path="discounts/new" element={<AdminDiscountForm />} />
      <Route path="discounts/:discountId" element={<AdminDiscountForm />} />
      <Route path="warranty" element={<AdminWarranty />} />
      <Route path="warranty/:ticketId" element={<AdminWarrantyDetail />} />
      <Route path="returns" element={<AdminReturns />} />
      <Route path="returns/:returnId" element={<AdminReturnDetail />} />
      <Route path="finance" element={<AdminFinance />} />
      <Route path="analytics" element={<AdminPlaceholder />} />
      <Route path="analytics/reports" element={<AdminPlaceholder />} />
      <Route path="analytics/live-view" element={<AdminDashboard />} />
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
