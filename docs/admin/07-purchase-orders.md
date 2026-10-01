# Purchase orders

Open **Products → Purchase orders**.

## Flow
1. **New purchase order:** enter supplier, expected date and the products with quantity and unit cost. It is saved as a **Draft** and does not affect stock.
2. **Place order:** the status becomes *Ordered* and the quantities count as **Incoming** stock. Ordered quantities are locked from now on.
3. **Receive:** open the order and enter what actually arrived per product. Each quantity moves from Incoming to **On hand**. Use *Save received quantities* for a partial delivery (optionally *Mark partially received*).
4. **Close as received:** finishes the order. Anything not delivered is removed from Incoming.
5. **Cancel order** (draft, ordered or partially received) removes what is still incoming. Stock already received stays.

Receiving more than ordered is allowed; On hand grows by the full amount.

Only **Super Admin** and **Inventory Manager** can create or change purchase orders. Every stock change is recorded in the inventory movement ledger.
