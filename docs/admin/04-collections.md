# Collections

Open **Products → Collections**. Requires migration `0023_product_translations_collections.sql`.

A collection is a hand-picked list of products with its own page in the shop at `/category/<address>`.

## Your collections
- **Add collection:** choose the address (lowercase letters, numbers and hyphens; it cannot be changed later), a title in German, English and Vietnamese (an empty title falls back to the translation in code, then to English), and the products in display order (search by name or SKU, move up or down, remove).
- **Visible in the shop** switches the page on or off. Products that are not published are hidden in the collection even if they are listed.
- **Edit** and **Delete** (the products stay). Everything is recorded in the audit log. Only Super Admin and Inventory Manager can change collections.
- **Best sellers** and **Anti-aging** used to be fixed lists in the code. The migration copies them here, so you can edit them. If you delete one, the old list from the code is used again.
- These pages are rendered in the browser and are **not part of the pre-built sitemap** yet. Link to them from emails, journal articles, discounts or the shop menu. The menu links themselves are set in the code.

## Built-in pages
The four **categories** (Skincare Devices, Hair Removal, Hair Styling & Care, Body & Wellness) and the automatic pages **New in** (products marked as new), **Sale** (products with a sale price) and **Under €100** are listed for reference. They follow rules and cannot be edited here. The addresses `shop`, `new-in`, `sale`, `under-100` and the category addresses are reserved.

## Not built yet
- Automatic collections by tag, price or category rules that you define.
- Collection descriptions and images, and adding collections to the shop menu from the admin.
