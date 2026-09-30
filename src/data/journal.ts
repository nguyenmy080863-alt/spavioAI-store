/**
 * Journal (Ratgeber) guides. The text of each guide lives in `src/i18n/locales/<lang>/journal.json`
 * under `articles.<slug>`; this file holds what is shared across languages.
 * Every guide is prerendered in all languages and listed in the sitemap (see src/entry-server.tsx).
 */
export type JournalTopic = "skincare" | "hair-removal" | "hair" | "body";

export interface JournalArticle {
  slug: string;
  topic: JournalTopic;
  /** Product slugs featured in the guide; the first one supplies the card artwork and share image. */
  productIds: string[];
  /** ISO dates (YYYY-MM-DD). */
  published: string;
  updated: string;
  readingMinutes: number;
}

export const JOURNAL_ARTICLES: JournalArticle[] = [
  {
    slug: "led-light-therapy-colours",
    topic: "skincare",
    productIds: ["lumina-led-mask", "lumipore"],
    published: "2026-09-30",
    updated: "2026-09-30",
    readingMinutes: 6,
  },
  {
    slug: "ipl-hair-removal-at-home",
    topic: "hair-removal",
    productIds: ["silk-ipl", "precision-trimmer", "cryo-glow-roller"],
    published: "2026-09-30",
    updated: "2026-09-30",
    readingMinutes: 6,
  },
  {
    slug: "microcurrent-facial-toning",
    topic: "skincare",
    productIds: ["sculpt-microcurrent", "lumipore"],
    published: "2026-09-30",
    updated: "2026-09-30",
    readingMinutes: 5,
  },
  {
    slug: "radiofrequency-skin-tightening",
    topic: "skincare",
    productIds: ["thermalift-rf", "cryo-glow-roller"],
    published: "2026-09-30",
    updated: "2026-09-30",
    readingMinutes: 5,
  },
  {
    slug: "skincare-device-routine",
    topic: "skincare",
    productIds: ["sonic-cleanse-brush", "aqua-ion-infuser", "eye-revive-wand", "cryo-glow-roller"],
    published: "2026-09-30",
    updated: "2026-09-30",
    readingMinutes: 5,
  },
  {
    slug: "ionic-hair-dryer-guide",
    topic: "hair",
    productIds: ["aura-ionic-dryer", "glide-straightener", "scalp-revive"],
    published: "2026-09-30",
    updated: "2026-09-30",
    readingMinutes: 5,
  },
  {
    slug: "massage-gun-guide",
    topic: "body",
    productIds: ["pulse-mini-massager", "contour-body-sculptor"],
    published: "2026-09-30",
    updated: "2026-09-30",
    readingMinutes: 4,
  },
];

export const JOURNAL_PATH = "/journal";
export const journalArticlePath = (slug: string) => `${JOURNAL_PATH}/${slug}`;
export const getJournalArticle = (slug: string | undefined) => JOURNAL_ARTICLES.find((a) => a.slug === slug);
/** Guides that feature a given product, for linking from product pages. */
export const articlesForProduct = (productId: string) =>
  JOURNAL_ARTICLES.filter((a) => a.productIds.includes(productId));

/** Shape of one guide in journal.json. */
export interface JournalArticleText {
  title: string;
  description: string;
  excerpt: string;
  intro: string;
  sections: { heading: string; paragraphs?: string[]; bullets?: string[] }[];
  faq: { question: string; answer: string }[];
}
