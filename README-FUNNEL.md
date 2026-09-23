# SEA funnel — what shipped, and what is still open

## Running it

```bash
# one-time, after pulling: apply the new tables and columns
pnpm --dir backend sql sql/funnel.sql

# create the /c/weihnachten landing page
pnpm --dir backend db:seed:bundles

# pull the real Christmas range from biglittlethings.de (re-runnable)
pnpm --dir backend import:christmas          # add --dry to preview
```

## The Christmas range

`import:christmas` reads the marketing site's WooCommerce Store API
(category "Weihnachten") and writes all ten boxes into the catalogue with their
real names, prices and photography. Re-run it whenever the range changes; it
matches on SKU and replaces each parts list whole.

Eight boxes list their contents, so they land as pre-configured boxes with those
contents as components. "Neujahrsbox" and "Weihnachtsbox S" are sold as
surprises with no fixed contents, so they land as ordinary products — a box
whose parts list is a guess would misprice the moment somebody customised it.

Two things in this import are derived rather than read, and both are worth a
look before the campaign runs:

- **Prices are converted from gross to net** by dividing by 1.19, which
  reproduces the configurator page exactly (€14.35 gross is the €12.06 net it
  advertises). If a box is ever zero-rated or reduced-rate, its net price here
  will be wrong.
- **The treats have estimated prices.** The site prices boxes, never their
  contents, so each treat is valued at its share of the boxes it appears in.
  That keeps a customised box in the right neighbourhood instead of collapsing
  it to nothing. Every one of them says so in its details and can be corrected
  in Dashboard → Products.

The treats also have no photographs — the site only ever shoots whole boxes — so
they carry a named placeholder tile until someone adds real ones.

The landing link to hand to the agency:

```
https://<app-domain>/c/weihnachten?lang=de
```

Campaign parameters go on the end and are captured first-touch:
`gclid`, `fbclid`, `msclkid`, `utm_source`, `utm_medium`, `utm_campaign`,
`utm_term`, `utm_content`.

## Lead webhook

Set these on the API and the queue starts draining:

```
LEAD_INTAKE_URL=https://bknuhhqugdcgmrtdqvik.supabase.co/functions/v1/lead-intake
LEAD_INTAKE_TOKEN=<the token from the URL marketbirds sent>
```

Events are written to `outbound_events` whether or not the URL is set, so
nothing is lost by configuring it later. Delivery is at-least-once and every
request carries `X-Event-Id` for the receiver to deduplicate on.

`order.created` fires when a request is sent. `order.status_changed` fires on
every status move, which is where the lead-quality signal lives
(`new → quoted → confirmed`).

## Buy-only landing pages

A collection can offer the box builder or not. The switch is at the top of
Dashboard → Landing Pages → Edit this page: **Let visitors build and brand their
own box**.

Turned off, the page drops the "build your own" section and the customise button
on every box, and says the boxes are ready to order as they are. A box opened
from that page carries the campaign on its link (`?from=<slug>`), so its product
page withholds the same thing. The setting describes the visit, not the visitor:
the identical product opened from anywhere else still offers customisation.

Apply the column once with:

```bash
pnpm --dir backend sql sql/collection-customization.sql
```

## Still open

1. **The webhook's payload schema.** The endpoint only answers a health check on
   GET, so the shape in `leadPayload` (backend/src/modules/orders/orders.service.ts)
   is our proposal. Confirm the field names and whether the token belongs in the
   header or the query string.
2. **Treat prices and photos** are estimated and placeholder respectively — see
   "The Christmas range" above.
3. **Minimum order quantities.** Imported as 1. The marketing site says custom
   boxes start at 50, and the ready-made boxes state no minimum.
4. **Sending lead email addresses to a third party needs a privacy-policy line**
   and a lawful basis. Decide whether to send the address or a hash of it before
   pointing `LEAD_INTAKE_URL` at production.
5. **The app's public domain**, so the ad links and the Firebase hosting config
   agree.
