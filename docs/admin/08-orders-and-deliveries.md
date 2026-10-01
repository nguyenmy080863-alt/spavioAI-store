# Orders and deliveries

Open **Orders**.

## Order flow
1. **New order** creates an unpaid order (customer, products, prices). Orders from checkout will use the same tables once checkout is connected.
2. **Mark as paid:** stock is **committed** (reserved). Shop availability = on hand − committed.
3. **Create delivery:** choose the quantity per product (a delivery can cover only part of the order), carrier and tracking number. The delivery starts as **Preparing**; stock does not move yet.
4. **Picked up by carrier** → *On delivery*. Stock leaves the warehouse: On hand and Committed both go down.
5. **Mark delivered** → *Delivered*. When every product is fully delivered the order becomes **Completed**.

## Cancelling
- A delivery can be cancelled only while *Preparing*.
- **Cancel order** releases the committed stock that was not shipped and cancels deliveries still preparing. Refunding goods that were already shipped is not supported yet.

Orders can only be edited while unpaid. Any admin role can work with orders and deliveries.
