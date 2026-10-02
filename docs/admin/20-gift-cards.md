# Gift cards

Open **Products → Gift cards**. Issue gift cards for goodwill, prizes or gifts. Customers enter the code at checkout and the value pays for their order. Requires migration `0024_gift_cards.sql`.

**Who can use it:** Super Admins and Order Processors. Other roles cannot see the cards or their codes (a code is like cash).

A gift card is a **prepaid balance, not a discount**. It pays for an order after discounts and shipping are worked out. Giving out or selling a card is **not revenue**; the unused balance is a debt to the customer, and the revenue is the order it pays for.

## Rules
- **Maximum value of one card: €200.**
- **No expiry** unless you set one. In Germany a gift card generally cannot expire within **3 years** (end of the year of purchase plus 3 years), so only set a date after checking with your advisor.
- **One gift card per order** for now. A card can be used on several orders until its balance is gone.
- Codes look like `GC-1A2B-3C4D-5E6F-7A8B`, are random and not guessable.

## Issue a card
**Issue gift card:** value, optional expiry, optional recipient name and email, and an internal note (why it was issued). The code is shown once with **Copy code** and **Copy message** (a ready-to-send text in German, English or Vietnamese). You can open the card again later in the list.

Cards are **not emailed from the store yet** (emails are not connected). Send the code yourself.

## The list and a card
The list shows code, recipient, balance, status (Active, Used up, Expired, Switched off) and date, with totals on top (outstanding balance, cards with balance, total issued). **Open** a card to:
- see its **history**: issued, used on an order, given back when an order was cancelled, credited by a return, corrected;
- **Switch off / on** (a switched-off card cannot be used);
- **Correct the balance** (plus or minus) with a required reason. The balance stays between 0 and €200.

Every balance is the sum of its history, and balances only change through these steps.

## At checkout
The customer presses **Have a gift card?** and enters the code. The summary shows how much of the card will be used.
- If the card covers **part** of the order, the rest is paid with PayPal (PayPal only charges what is left) and the remaining balance stays on the card.
- If it covers **everything**, the checkout shows "Pay with gift card" instead of the payment methods and the order is **marked paid automatically** (there is no outside payment to verify). Stock is reserved and the payment confirmation email is queued as usual.
- The value is held on the card when the order is placed. If the order is **cancelled**, or stays unpaid and unreported for **3 hours**, the balance goes back to the card.
- Orders that used a card show "Paid partly with a gift card" on the order page.

## Returns
If a gift card paid part of an order, the return page shows a **Partly paid with a gift card** box once the parcel is received. Decide how much of the refund goes **back to the gift card** (the suggestion follows how the order was paid), press **Credit gift card**, and the **PayPal refund covers only the rest**. Refunding is blocked until you decide. If the card paid the whole order, the whole refund goes back to the card and no PayPal refund is needed.

## Finance
The Finance page shows the **outstanding gift card balance**, cards issued in the period, value used on orders, and value credited back. The transaction CSV includes the gift card lines (codes masked to the last 4 characters) in a **Gift card amount** column.

## Rules to check with your advisor (not legal advice)
- **VAT:** a voucher for one specific purpose is taxed when sold; a voucher usable for many things is taxed when redeemed. Because you ship to several EU countries it is probably the second kind, but confirm it.
- **Expiry** and **withdrawal rights** (see above and your terms). Add gift card conditions to your terms of service (no cash payout, loss of a code, who can use it).

## Not built yet
- Selling gift cards online as a product (needs a product without shipping or stock, issuing the code when payment is confirmed, and email delivery).
- Emailing the card, scheduled delivery, a public "check my balance" page.
- Using a gift card in draft orders and payment links (create the order paid by "Other" for now), and more than one card on an order.
