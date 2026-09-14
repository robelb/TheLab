# SEA funnel — what shipped, and what is still open

## Running it

```bash
# one-time, after pulling: apply the new tables and columns
pnpm --dir backend sql sql/funnel.sql

# seed three Christmas boxes and the /c/weihnachten landing page
pnpm --dir backend db:seed:bundles
```

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

## Still open

1. **The webhook's payload schema.** The endpoint only answers a health check on
   GET, so the shape in `leadPayload` (backend/src/modules/orders/orders.service.ts)
   is our proposal. Confirm the field names and whether the token belongs in the
   header or the query string.
2. **The real box contents and prices.** The three seeded boxes take their prices
   from the marketing site (€12.06 / €22.58 / €25.92 net) but their contents are
   picked automatically from the catalogue. Set the real ones in Dashboard →
   Products → the box → Box contents.
3. **Minimum order quantities.** Seeded as 1. The marketing site says custom
   boxes start at 50.
4. **Sending lead email addresses to a third party needs a privacy-policy line**
   and a lawful basis. Decide whether to send the address or a hash of it before
   pointing `LEAD_INTAKE_URL` at production.
5. **The app's public domain**, so the ad links and the Firebase hosting config
   agree.
