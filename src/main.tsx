import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, hydrate, type DehydratedState } from "@tanstack/react-query";
import { AppContent, AppProviders } from "./App.tsx";
import { CartProvider } from "./context/CartContext.tsx";
import "./i18n";
import "./index.css";

declare global {
  interface Window {
    /** Query cache embedded into prerendered pages by scripts/prerender.mjs. */
    __SPAVIO_QUERY_STATE__?: DehydratedState;
  }
}

const queryClient = new QueryClient();
if (window.__SPAVIO_QUERY_STATE__) {
  hydrate(queryClient, window.__SPAVIO_QUERY_STATE__);
  delete window.__SPAVIO_QUERY_STATE__;
}

// Prerendered pages ship full HTML for crawlers; the client renders fresh over it
// (cart, countdown and auth state only exist in the browser).
createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <CartProvider>
      <AppProviders queryClient={queryClient}>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AppProviders>
    </CartProvider>
  </HelmetProvider>
);
