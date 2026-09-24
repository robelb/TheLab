# Shop analytics dashboard — what each card means

Dashboard: https://eu.posthog.com/project/204810/dashboard/971582

- Every card shows the **last 30 days** unless you change the date at the top.
- **Our own team is not counted.** When a super admin opens the shop, it is left out.
- A **visitor** is one person (one browser), even if they come back many times.

---

## Headline numbers

### Orders requested
**Shows:** how many checkout requests were sent.
**Use it for:** the main result. If this goes up, the shop is working.

### Requested value
**Shows:** the total € of all requests (the shop's estimated price, before VAT).
**Use it for:** how much business is coming in. The final price can change when we confirm the order.

### Average basket at checkout
**Shows:** the average € in the cart when someone opens checkout.
**Use it for:** knowing if people buy small or big. Offers like "free shipping over X" should push this up.

---

## Funnels (where people drop off)

A funnel shows the steps a visitor goes through and what % make it to the next step. The biggest drop is the step to fix first.

### Campaign funnel
**Steps:** opened a collection page → added to cart → started checkout → sent request → order confirmed
**Use it for:** judging our ad landing pages (e.g. `/c/weihnachten`).
- Big drop after "opened collection": the page or products don't convince them.
- Big drop after "started checkout": the checkout form is too long or unclear.

### Cart to order funnel
**Steps:** added to cart → looked at cart → started checkout → sent request → order confirmed
**Use it for:** the same as above, but for everyone who added something to the cart (from a collection or the normal shop).

---

## Collections

### Collection scoreboard
One row per collection. The columns:

| Column | Meaning |
|---|---|
| visitors | people who opened the collection page |
| product_views | product pages opened while inside this collection |
| added_to_cart | people who put something in the cart |
| checkouts | people who opened checkout |
| requests | requests sent |
| confirmed | orders we confirmed (invoice sent) |
| visit_to_request_pct | % of visitors who sent a request |
| requested_value | € total of the requests |

**Use it for:** comparing collections. Which campaign brings the most visitors, and which one actually turns visitors into orders. Put ad money into the one with the best `visit_to_request_pct`.

### Collection visitors per day
**Shows:** a line per collection with unique visitors each day.
**Use it for:** seeing if an ad or newsletter brought traffic, and when traffic drops.

---

## Products

### Most viewed products
One row per product (per collection). `(shop)` means it was viewed outside any collection.

| Column | Meaning |
|---|---|
| views | how many times the product page was opened |
| viewers | how many different people opened it |
| added_to_cart | how many times it was added to the cart |
| view_to_cart_pct | % of views that led to an add to cart |

**Use it for:**
- **Many views, low %:** people are interested but don't buy. Check the price, photos or text.
- **High %:** a strong product. Show it higher on the page or in ads.

Note: ready-made boxes can be added straight from the collection page without opening the product page, so they can show adds with 0 views.

### Most added to cart
**Shows:** the products and ready-made boxes added to carts most often.
**Use it for:** knowing your best sellers. Make sure they are in stock.

---

## Cart and checkout

### Cart activity
**Shows:** per day, how many times people added products, added ready-made boxes, added built boxes, removed items, and opened the cart.
**Use it for:** a quick health check. Lots of removals means people change their mind in the cart (often price or shipping).

### Checkout outcomes
**Shows:** per day, people who **opened checkout**, **sent a request**, and whose request **failed**.
**Use it for:** the gap between "opened" and "sent" is the people who left at checkout (abandoned). "Failed" should be close to zero. If it isn't, something is broken.

### Failed requests by reason
**Shows:** why a request didn't go through (error code).
**Use it for:** finding bugs. For example `collection_unavailable` means the campaign ended while they were checking out.

---

## Orders after checkout

These come from our server, when a super admin works on the order in the dashboard. They only include orders from after the tracking went live.

### Order pipeline
**Shows:** every order grouped by where it is **now** (`new`, `quoted`, `confirmed`, `cancelled`) and if it is `paid` or `unpaid`, with the count and € value.
**Use it for:** the to-do list.
- `new`: requests nobody has handled yet.
- `confirmed` + `unpaid`: invoices sent, money not yet received.

### Order status changes
**Shows:** per week, how many orders moved into each status.
**Use it for:** how fast the team handles requests, and how many get cancelled.

---

## Where orders come from

### Requests by traffic source
**Shows:** requests grouped by the ad or source that brought the visitor (`utm_source`, e.g. `google`, `facebook`). "None" means no tracked link, e.g. a direct visit or a search result.
**Use it for:** seeing which ad channel brings actual orders, not just clicks.

---

## Changing the dashboard

The dashboard is built from `backend/scripts/posthog-dashboard.ts`. To change a card, edit that file and run:

```bash
pnpm --dir backend analytics:dashboard
```

Cards you add by hand in PostHog are kept.
