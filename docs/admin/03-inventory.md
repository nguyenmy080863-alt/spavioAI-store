# Inventory

Open **Products → Inventory**.

## What you see
- Tiles: units on hand, low-stock count, out-of-stock count.
- A table of active products with status pill, low-stock threshold and on-hand quantity.
- Search by name or SKU and filter by stock level.

## Adjusting stock
1. Press **Adjust** on a row.
2. Enter a change such as `+5` or `-2` and choose a reason (correction, received, damaged, returned, stock count).
3. Check the preview (`12 → 17`) and press **Save**.

Stock never goes below 0. Each adjustment is saved to the audit log with old value, new value and reason. **Export CSV** downloads the filtered list.

## Stock buckets
- **On hand:** physically in the warehouse.
- **Incoming:** on placed purchase orders, not received yet.
- **Committed:** sold and paid, not yet picked up by the carrier.
- **Available:** on hand − committed. This is the quantity the shop sells.

Adjustments are saved in the inventory ledger (`inventory_movements`) with the reason, along with receipts, reservations and shipments.

## Not built yet
Multiple locations, per-variant tracking, a history view, bulk edit and CSV import, transfers, stock counts and low-stock notifications.
