import {
  BarChart3,
  BookOpen,
  Percent,
  Receipt,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavChild {
  title: string;
  to: string;
}

export interface AdminNavSection {
  title: string;
  to: string;
  icon: LucideIcon;
  children?: AdminNavChild[];
}

/** Main admin sections. Add or rename sub-sections here; routes live in src/App.tsx. */
export const adminNav: AdminNavSection[] = [
  {
    title: "Orders",
    to: "/admin/orders",
    icon: ShoppingBag,
    children: [
      { title: "Drafts", to: "/admin/orders/drafts" },
      { title: "Shipping labels", to: "/admin/orders/shipping-labels" },
    ],
  },
  {
    title: "Products",
    to: "/admin/products",
    icon: Tag,
    children: [
      { title: "Collections", to: "/admin/products/categories" },
      { title: "Inventory", to: "/admin/products/inventory" },
      { title: "Purchase orders", to: "/admin/products/purchase-orders" },
      { title: "Transfers", to: "/admin/products/transfers" },
      { title: "Gift cards", to: "/admin/products/gift-cards" },
    ],
  },
  { title: "Customers", to: "/admin/customers", icon: Users },
  {
    title: "Discounts",
    to: "/admin/discounts",
    icon: Percent,
    children: [{ title: "Flash sale", to: "/admin/discounts/flash-sale" }],
  },
  { title: "Warranty", to: "/admin/warranty", icon: ShieldCheck },
  { title: "Returns", to: "/admin/returns", icon: RotateCcw },
  { title: "Finance", to: "/admin/finance", icon: Wallet },
  {
    title: "Analytics",
    to: "/admin/analytics",
    icon: BarChart3,
    children: [
      { title: "Reports", to: "/admin/analytics/reports" },
      { title: "Live View", to: "/admin/analytics/live-view" },
    ],
  },
];

/** Documentation of the store's flows and features (markdown files in /docs). */
export const adminDocsNav: AdminNavSection = {
  title: "Docs",
  to: "/admin/docs",
  icon: BookOpen,
  children: [
    { title: "For customers", to: "/admin/docs/customer" },
    { title: "For admins", to: "/admin/docs/admin" },
  ],
};

/** Existing store-management pages, kept together at the bottom of the sidebar. */
export const adminSettingsNav: AdminNavSection = {
  title: "Store settings",
  to: "/admin/settings",
  icon: Settings,
  children: [
    { title: "Hero banner", to: "/admin/hero" },
    { title: "Team & roles", to: "/admin/team" },
    { title: "Audit log", to: "/admin/audit-log" },
  ],
};

export const adminOverview = { title: "Overview", to: "/admin", icon: Receipt };
