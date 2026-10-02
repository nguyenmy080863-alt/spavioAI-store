/**
 * Prerenders every storefront page, in every language, into static HTML after `vite build`.
 *
 *   dist/index.html, dist/product/<slug>/index.html, dist/vi/product/<slug>/index.html, ...
 *   dist/404.html     real "not found" page (served with a 404 status by the host)
 *   dist/200.html     empty SPA shell for client-only routes (admin panel)
 *   dist/sitemap.xml  all indexable URLs with hreflang alternates
 *
 * Run through `npm run build`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SITE_URL = "https://spavioai.store";
const root = process.cwd();
const dist = path.join(root, "dist");
const serverEntry = path.join(root, "dist-server", "entry-server.js");

/** Pages rendered as HTML but kept out of search results (they carry noindex). */
const NOINDEX_PATHS = ["/checkout", "/login", "/signup", "/account", "/warranty", "/warranty/track"];

const { render, getIndexablePaths, languages, localizePath, DEFAULT_LANGUAGE } = await import(pathToFileURL(serverEntry).href);

const template = await fs.readFile(path.join(dist, "index.html"), "utf8");
if (!template.includes("<!--seo-->") || !template.includes('<div id="root"></div>')) {
  throw new Error("index.html is missing the <!--seo--> block or the empty #root element");
}

// Keep the untouched shell for client-only routes before index.html is overwritten.
await fs.writeFile(
  path.join(dist, "200.html"),
  template.replace("<!--seo-->", '<!--seo-->\n  <meta data-rh="true" name="robots" content="noindex, nofollow" />'),
);

const escapeState = (state) => JSON.stringify(state).replace(/</g, "\\u003c");

const toPage = (result) =>
  template
    .replace(/<html[^>]*>/, `<html ${result.htmlAttributes}>`)
    .replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, result.head)
    .replace('<div id="root"></div>', `<div id="root">${result.html}</div>`)
    .replace(
      "</body>",
      `<script>window.__SPAVIO_QUERY_STATE__=${escapeState(result.state)}</script>\n</body>`,
    );

const outputFile = (url) =>
  url === "/" ? path.join(dist, "index.html") : path.join(dist, ...url.split("/").filter(Boolean), "index.html");

const writePage = async (file, html) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html);
};

const indexable = await getIndexablePaths();
let count = 0;

for (const lang of languages) {
  for (const pagePath of [...indexable, ...NOINDEX_PATHS]) {
    const url = localizePath(pagePath, lang);
    const result = await render(url);
    await writePage(outputFile(url), toPage(result));
    count += 1;
  }
}

// Unknown URLs: hosts serve 404.html with a real 404 status code.
for (const lang of languages) {
  const file = lang === DEFAULT_LANGUAGE ? path.join(dist, "404.html") : path.join(dist, lang, "404.html");
  await writePage(file, toPage(await render(localizePath("/__not-found__", lang))));
}

// Sitemap with hreflang alternates for every indexable page.
const lastmod = new Date().toISOString().slice(0, 10);
const priorityOf = (p) =>
  p === "/" ? "1.0" : p.startsWith("/product/") || p.startsWith("/category/") ? "0.8" : p.startsWith("/journal") ? "0.7" : "0.5";
const alternates = (p) =>
  [
    ...languages.map(
      (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE_URL}${localizePath(p, l)}"/>`,
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${localizePath(p, DEFAULT_LANGUAGE)}"/>`,
  ].join("\n");
const urls = languages.flatMap((lang) =>
  indexable.map(
    (p) => `  <url>
    <loc>${SITE_URL}${localizePath(p, lang)}</loc>
${alternates(p)}
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.startsWith("/product/") || p.startsWith("/category/") || p === "/" ? "weekly" : "monthly"}</changefreq>
    <priority>${priorityOf(p)}</priority>
  </url>`,
  ),
);
await fs.writeFile(
  path.join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`,
);

await fs.rm(path.join(root, "dist-server"), { recursive: true, force: true });
console.log(`Prerendered ${count} pages in ${languages.length} languages, 404 pages and sitemap.xml (${urls.length} URLs).`);
