# Products

Open **Products** in the sidebar. Translations and collections need migration `0023_product_translations_collections.sql`; weights need `0022`.

## List
- Search by name, SKU or category. Filter by status (published, draft, archived, preorder), **category**, **stock** (low or out) and **without image**.
- **Sort** by recently updated, name, price or stock. Choose **25, 50 or 100 rows** per page.
- Select rows to **publish**, **unpublish**, **archive**, **restore** or permanently **delete** them in bulk.
- **Duplicate** copies a product as a new draft: same texts, price, category, weight and translations, with stock 0 and **no images** (image files belong to the original).
- Each row shows the product with its SKU and category, the price, the stock, the status and the actions. **Edit** is a button; **Publish / Unpublish** and **Duplicate** are in the **⋯** menu.
- A small amber line under the product name appears only when something is missing on its page: no image, short description (under 40 characters), no weight, or no translation in German, English or Vietnamese. Products with nothing missing show nothing.
- To see the most recently changed products first, sort by **Recently updated**.

## Create or edit
Use **New product**, or press **Edit** on a product row in the list (clicking the product name works too). Fields: title, SKU, category, effect tag, price and sale price, starting stock (new products), low-stock alert, parcel weight, status, images, preorder options and translations.
- **Storefront address.** For a new product the address (`/product/<address>`) follows the title until you edit it. After the product is created it **stays fixed**. Changing it would break links and the translations stored for it. If you really need a new address, duplicate the product.
- **Unsaved changes.** The form tells you when something is unsaved and asks before you leave.
- **Duplicate SKU or address** shows a plain message instead of a database error.
- **View on storefront** opens the product page; for a draft the button is **Preview draft** and opens the page with a banner. Only signed-in team members can see a preview; customers never can.

## Stock
For a new product you enter the **starting stock**. For an existing product the form shows the numbers read-only: available to sell, on hand, incoming and reserved. **Change stock in Inventory**, with a reason, so the history stays clear. See the Inventory page.

## Translations
Each product has a **Translations** section with a tab per language (Deutsch, English, Tiếng Việt): name, effect tag, description and editor's notes. The storefront uses, per field: the translation saved here, then the translation stored in code (the first products), then the product's own text above. An empty language is removed. Translations are loaded in the browser, so the pre-built HTML pages show the original text until the page loads.

## Images
Drag and drop several images at once. They are compressed, thumbnails are generated, and files are stored in a private bucket. Saving **never deletes images before the new ones are written**: new images are added, existing ones are reordered, and only then the ones you removed are dropped.

## Weight
**Weight with packaging** (grams) is used to estimate the parcel weight when buying shipping labels (see Shipping labels).

## Permissions
Only **Super Admin** and **Inventory Manager** can change products. Other roles can view.

## Product page changes
The product page no longer shows the **customer reviews block**. It displayed made-up reviews and a fixed 4.8 rating on every product, which is misleading to customers and not allowed. Real reviews can be added later (they would need to come from verified buyers).

Every change to products is recorded in the **Audit log**.
