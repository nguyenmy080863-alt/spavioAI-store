export type DocGroup = "customer" | "admin" | "testing";

export interface DocEntry {
  group: DocGroup;
  slug: string;
  title: string;
  load: () => Promise<string>;
}

export interface DocSection {
  title: string;
  description: string;
  /** Doc keys as "group/slug", in reading order. */
  pages: string[];
}

export const DOC_GROUPS: Record<DocGroup, { title: string; description: string }> = {
  admin: { title: "For admins", description: "How to run the store from the admin panel." },
  customer: { title: "For customers", description: "What shoppers can do and how the flows work." },
  testing: { title: "Testing", description: "How to check that everything works as designed." },
};

/** The manual's table of contents. Pages not listed here end up in "More". */
export const DOC_SECTIONS: DocSection[] = [
  {
    title: "Getting started",
    description: "Sign in, find your way around and watch the shop live.",
    pages: ["admin/getting-started", "admin/overview", "admin/live-view", "admin/team-and-roles"],
  },
  {
    title: "Catalog & stock",
    description: "Products, collections, inventory and supplier orders.",
    pages: ["admin/products", "admin/collections", "admin/inventory", "admin/purchase-orders", "admin/flash-sale"],
  },
  {
    title: "Orders & shipping",
    description: "From a paid order to a delivered parcel.",
    pages: [
      "admin/orders-and-deliveries",
      "admin/draft-orders",
      "admin/shipping-labels",
      "admin/order-emails",
    ],
  },
  {
    title: "Discounts & gift cards",
    description: "Codes, automatic discounts and gift cards.",
    pages: ["admin/discounts", "admin/gift-cards"],
  },
  {
    title: "After the sale",
    description: "Returns, warranty and customer records.",
    pages: ["admin/returns", "admin/warranty", "admin/customers"],
  },
  {
    title: "Finance & analytics",
    description: "Money to check, reports and KPIs.",
    pages: ["admin/finance", "admin/analytics"],
  },
  {
    title: "The customer's view",
    description: "What shoppers see and do, step by step.",
    pages: [
      "customer/shopping-flow",
      "customer/account-and-login",
      "customer/preorders-and-flash-sale",
      "customer/discounts",
      "customer/gift-cards",
      "customer/payment-link",
      "customer/orders-and-tracking",
      "customer/returns",
      "customer/warranty-and-support",
    ],
  },
  {
    title: "Testing",
    description: "Test plan, dummy data and a safe test environment.",
    pages: ["testing/test-plan", "testing/test-environment"],
  },
];

// Markdown lives in /docs; files are loaded on demand.
const files = import.meta.glob("/docs/*/*.md", { query: "?raw", import: "default" }) as Record<
  string,
  () => Promise<string>
>;

const prettify = (name: string) => {
  const text = name.replace(/^\d+-/, "").replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const docs: DocEntry[] = Object.keys(files)
  .sort()
  .flatMap((path) => {
    const match = path.match(/^\/docs\/(customer|admin|testing)\/(.+)\.md$/);
    if (!match) return [];
    const [, group, name] = match;
    return [
      {
        group: group as DocGroup,
        slug: name.replace(/^\d+-/, ""),
        title: prettify(name),
        load: files[path],
      },
    ];
  });

export const docKey = (doc: DocEntry) => `${doc.group}/${doc.slug}`;
export const docPath = (doc: DocEntry) => `/admin/docs/${doc.group}/${doc.slug}`;
export const docsInGroup = (group: DocGroup) => docs.filter((doc) => doc.group === group);
export const findDoc = (group: string, slug: string) =>
  docs.find((doc) => doc.group === group && doc.slug === slug);

/** Sections with their resolved pages; unlisted pages are collected in a final "More" section. */
export const resolvedSections = (): (DocSection & { entries: DocEntry[] })[] => {
  const byKey = new Map(docs.map((doc) => [docKey(doc), doc]));
  const listed = new Set(DOC_SECTIONS.flatMap((section) => section.pages));
  const sections = DOC_SECTIONS.map((section) => ({
    ...section,
    entries: section.pages.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : [])),
  })).filter((section) => section.entries.length > 0);
  const rest = docs.filter((doc) => !listed.has(docKey(doc)));
  if (rest.length > 0) {
    sections.push({ title: "More", description: "Other pages.", pages: [], entries: rest });
  }
  return sections;
};

/** All pages in reading order, for previous / next links. */
export const readingOrder = () => resolvedSections().flatMap((section) => section.entries);
