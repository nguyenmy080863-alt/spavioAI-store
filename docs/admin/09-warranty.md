# Warranty and support tickets

Open **Warranty**. Customers and guests open tickets for **guidance** (setup, usage, care), a **product defect**, or something else. You answer them here and can schedule a visit.

Requires migration `0012_warranty_tickets.sql`.

## How a ticket moves

| Status | Meaning | Who sets it |
| --- | --- | --- |
| Open | New, nobody has looked at it | Automatic |
| In review | The team is working on it | Automatic on your first public reply, or set by hand. Also set when the customer replies |
| Awaiting customer | You asked a question and wait for the answer | You |
| Visit scheduled | A visit date and time are set | You (a visit date is required) |
| Resolved | Fixed or answered | You. A customer reply reopens it as In review |
| Closed | Finished; the customer can no longer reply | You |

## Working a ticket
1. The list shows tickets that **need work** by default. Filter by status or type, or search by ticket number, customer, subject or serial number. The three counters on top show new tickets, tickets waiting for the customer and scheduled visits.
2. Open a ticket to see the customer details, the product and serial number, the warranty standing and the full conversation.
3. **Send reply** writes to the customer. Tick **Internal note** to leave a note only your team sees (shown in amber).
4. On the right, set status, priority, the visit date and time with notes, and a **resolution** text that the customer sees. **Assign to me** marks you as the owner. Every change is written to the audit log.

## Warranty standing
Each device has a **2-year warranty that starts on the delivery date** of the order.

- **In warranty / Expired**: the order number and email on the ticket matched an order, and it has a delivered delivery.
- **Not delivered yet**: the order matched, but no delivery is marked *Delivered*, so the warranty has not started.
- **Purchase unverified**: no order matched (no order number, a typo, or a different email). The ticket is still created. Check the purchase by hand before promising a free repair.

## Not built yet (v1)
- Email notifications. Customers and admins are **not emailed** about new tickets or replies; each side has to open the ticket page. Planned for v1.1.
- Photo and video attachments.
- Linking a ticket to a specific product line of the order (the customer picks the product by name).
