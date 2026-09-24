#!/usr/bin/env node
/**
 * Build — or bring up to date — the "Shop analytics" dashboard in PostHog.
 *
 * The dashboard is defined here rather than clicked together, so it changes
 * with the events it reads and can be rebuilt in a fresh project. Re-running is
 * safe: insights are matched by name and updated in place, and anything added
 * to the dashboard by hand is left alone.
 *
 * Needs, in backend/.env:
 *   POSTHOG_PERSONAL_API_KEY  phx_… — Settings → Personal API keys, with
 *                             read + write on insight, dashboard and action
 *   POSTHOG_PROJECT_ID        e.g. 204810
 *   POSTHOG_APP_HOST          https://eu.posthog.com (default)
 *
 * Usage:
 *   pnpm analytics:dashboard
 *
 * The events it reads (client unless marked):
 *   collection opened · product viewed · product / bundle / box added to cart
 *   cart viewed · product removed from cart · cart quantity changed
 *   checkout started · order requested · order request failed
 *   order status changed (server) · order payment status changed (server)
 * Every client event carries `funnel_collection` while the visitor is inside a
 * campaign, and `is_staff` for our own team, who are left out of every number.
 */
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY?.trim() ?? ''
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID?.trim() ?? ''
const HOST = (process.env.POSTHOG_APP_HOST?.trim() || 'https://eu.posthog.com').replace(/\/+$/, '')

const DASHBOARD_NAME = 'Shop analytics'
const ADDED_TO_CART_ACTION = 'Added to cart (any)'
const ADD_EVENTS = ['product added to cart', 'bundle added to cart', 'box added to cart']

// ── PostHog API ──────────────────────────────────────────────────────────────

async function api<T>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(`${HOST}/api/projects/${PROJECT_ID}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`${method} ${route} → ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}

interface Page<T> {
  results: T[]
  next: string | null
}

/** Every page of a list endpoint. */
async function listAll<T>(route: string): Promise<T[]> {
  const out: T[] = []
  let offset = 0
  for (;;) {
    const sep = route.includes('?') ? '&' : '?'
    const page = await api<Page<T>>('GET', `${route}${sep}limit=100&offset=${offset}`)
    out.push(...page.results)
    if (!page.next || page.results.length === 0) return out
    offset += page.results.length
  }
}

// ── Building blocks ──────────────────────────────────────────────────────────

/**
 * Our own team, left out. Written as HogQL so it reads the same whether
 * PostHog has typed `is_staff` as a boolean or a string — and passes events
 * that never had it (guests, the server).
 */
const NOT_STAFF_SQL = "coalesce(toString(properties.is_staff), '') != 'true'"
const NOT_STAFF = { type: 'hogql', key: NOT_STAFF_SQL }

const LAST_30_DAYS = { date_from: '-30d' }

const event = (name: string, extra: Record<string, unknown> = {}) => ({
  kind: 'EventsNode',
  event: name,
  name,
  ...extra,
})

const trends = (
  series: unknown[],
  opts: {
    display?: string
    interval?: string
    breakdown?: string
    /** `event` for a property name, `hogql` for an expression. */
    breakdownType?: 'event' | 'hogql'
  } = {},
) => ({
  kind: 'InsightVizNode',
  source: {
    kind: 'TrendsQuery',
    series,
    interval: opts.interval ?? 'day',
    dateRange: LAST_30_DAYS,
    properties: [NOT_STAFF],
    trendsFilter: { display: opts.display ?? 'ActionsLineGraph' },
    ...(opts.breakdown
      ? {
          breakdownFilter: {
            breakdown: opts.breakdown,
            breakdown_type: opts.breakdownType ?? 'event',
            breakdown_limit: 20,
          },
        }
      : {}),
  },
})

const funnel = (series: unknown[]) => ({
  kind: 'InsightVizNode',
  source: {
    kind: 'FunnelsQuery',
    series,
    dateRange: LAST_30_DAYS,
    properties: [NOT_STAFF],
    funnelsFilter: {
      funnelVizType: 'steps',
      // Long, because a company request is a decision — a box for 200 staff
      // is not ordered the minute it is found.
      funnelWindowInterval: 14,
      funnelWindowIntervalUnit: 'day',
    },
  },
})

/** A SQL table. `{filters}` is where the dashboard's date range lands. */
const sql = (query: string) => ({
  kind: 'DataVisualizationNode',
  display: 'ActionsTable',
  source: {
    kind: 'HogQLQuery',
    query: query.trim(),
    filters: { dateRange: LAST_30_DAYS },
  },
})

const ADD_EVENTS_SQL = ADD_EVENTS.map((e) => `'${e}'`).join(', ')
/** The campaign an event happened inside; the landing event names it itself. */
const COLLECTION_SQL = 'coalesce(properties.funnel_collection, properties.collection)'

// ── The dashboard ────────────────────────────────────────────────────────────

interface InsightDef {
  name: string
  description: string
  query: unknown
}

function insights(addedToCartActionId: number): InsightDef[] {
  const addedToCart = {
    kind: 'ActionsNode',
    id: addedToCartActionId,
    name: ADDED_TO_CART_ACTION,
  }
  const confirmed = event('order status changed', {
    custom_name: 'Order confirmed',
    properties: [{ key: 'status', value: ['confirmed'], operator: 'exact', type: 'event' }],
  })

  return [
    // Headline numbers
    {
      name: 'Orders requested',
      description: 'Checkout requests sent in the period.',
      query: trends([event('order requested')], { display: 'BoldNumber' }),
    },
    {
      name: 'Requested value',
      description: 'Sum of request totals (net, shop estimate) in the period.',
      query: trends(
        [event('order requested', { math: 'sum', math_property: 'total' })],
        { display: 'BoldNumber' },
      ),
    },
    {
      name: 'Average basket at checkout',
      description: 'Mean estimated total when checkout is opened.',
      query: trends(
        [event('checkout started', { math: 'avg', math_property: 'estimated_total' })],
        { display: 'BoldNumber' },
      ),
    },

    // Funnels
    {
      name: 'Campaign funnel',
      description:
        'From landing on a collection to a confirmed order, per visitor, within 14 days.',
      query: funnel([
        event('collection opened'),
        addedToCart,
        event('checkout started'),
        event('order requested'),
        confirmed,
      ]),
    },
    {
      name: 'Cart to order funnel',
      description:
        'Everyone who put something in the cart, collection or shop, and how far they got.',
      query: funnel([
        addedToCart,
        event('cart viewed'),
        event('checkout started'),
        event('order requested'),
        confirmed,
      ]),
    },

    // Collections
    {
      name: 'Collection scoreboard',
      description:
        'Per collection: visitors, product views, carts, checkouts, requests and confirmed orders.',
      query: sql(`
SELECT
  ${COLLECTION_SQL} AS collection,
  uniqIf(person_id, event = 'collection opened') AS visitors,
  countIf(event = 'product viewed') AS product_views,
  uniqIf(person_id, event IN (${ADD_EVENTS_SQL})) AS added_to_cart,
  uniqIf(person_id, event = 'checkout started') AS checkouts,
  countIf(event = 'order requested') AS requests,
  uniqIf(properties.reference, event = 'order status changed' AND properties.status = 'confirmed') AS confirmed,
  round(100 * requests / nullIf(visitors, 0), 1) AS visit_to_request_pct,
  round(sumIf(toFloat(properties.total), event = 'order requested'), 2) AS requested_value
FROM events
WHERE {filters}
  AND ${NOT_STAFF_SQL}
  AND ${COLLECTION_SQL} IS NOT NULL AND ${COLLECTION_SQL} != ''
GROUP BY collection
ORDER BY visitors DESC
LIMIT 50`),
    },
    {
      name: 'Collection visitors per day',
      description: 'Unique visitors landing on each collection.',
      query: trends([event('collection opened', { math: 'dau' })], {
        breakdown: 'collection',
      }),
    },

    // Products
    {
      name: 'Most viewed products',
      description:
        'Product pages by views, with how often a view became an add to cart. "(shop)" = outside any collection.',
      query: sql(`
SELECT
  coalesce(properties.funnel_collection, '(shop)') AS collection,
  any(coalesce(properties.product_name, properties.bundle_name)) AS product,
  coalesce(properties.product_id, properties.bundle_id) AS product_id,
  countIf(event = 'product viewed') AS views,
  uniqIf(person_id, event = 'product viewed') AS viewers,
  countIf(event IN (${ADD_EVENTS_SQL})) AS added_to_cart,
  round(100 * added_to_cart / nullIf(views, 0), 1) AS view_to_cart_pct
FROM events
WHERE {filters}
  AND ${NOT_STAFF_SQL}
  AND event IN ('product viewed', 'product added to cart', 'bundle added to cart')
  AND product_id IS NOT NULL
GROUP BY collection, product_id
ORDER BY views DESC, added_to_cart DESC
LIMIT 100`),
    },
    {
      name: 'Most added to cart',
      description: 'What goes into carts, single products and ready-made boxes.',
      query: trends(
        [event('product added to cart'), event('bundle added to cart')],
        {
          display: 'ActionsBarValue',
          breakdown: 'coalesce(properties.product_name, properties.bundle_name)',
          breakdownType: 'hogql',
        },
      ),
    },

    // Cart and checkout
    {
      name: 'Cart activity',
      description: 'Adds, removals and basket views per day.',
      query: trends(
        [
          ...ADD_EVENTS.map((e) => event(e)),
          event('product removed from cart'),
          event('cart viewed'),
        ],
        { display: 'ActionsBar' },
      ),
    },
    {
      name: 'Checkout outcomes',
      description:
        'Checkouts opened vs requests sent vs requests that failed. The gap is abandonment.',
      query: trends(
        [
          event('checkout started', { math: 'dau' }),
          event('order requested', { math: 'dau' }),
          event('order request failed', { math: 'dau' }),
        ],
        { display: 'ActionsBar' },
      ),
    },
    {
      name: 'Failed requests by reason',
      description: 'Why a checkout did not go through (HTTP status / error code).',
      query: trends([event('order request failed')], {
        display: 'ActionsTable',
        breakdown: 'error_code',
      }),
    },

    // Orders after checkout (server events)
    {
      name: 'Order pipeline',
      description:
        'Every request by where it stands now — new, quoted, confirmed, cancelled — and whether it is paid. From server events.',
      query: sql(`
SELECT
  status,
  payment_status,
  count() AS orders,
  round(sum(value), 2) AS value
FROM (
  SELECT
    properties.reference AS reference,
    argMax(properties.status, timestamp) AS status,
    argMax(coalesce(properties.payment_status, '—'), timestamp) AS payment_status,
    argMax(coalesce(toFloat(properties.total_gross), toFloat(properties.total)), timestamp) AS value
  FROM events
  WHERE event IN ('order status changed', 'order payment status changed')
    AND {filters}
  GROUP BY reference
)
GROUP BY status, payment_status
ORDER BY orders DESC`),
    },
    {
      name: 'Order status changes',
      description: 'How many requests moved into each status per week.',
      query: trends([event('order status changed')], {
        display: 'ActionsBar',
        interval: 'week',
        breakdown: 'status',
      }),
    },

    // Where requests come from
    {
      name: 'Requests by traffic source',
      description: 'Order requests by the utm_source of the click that brought them.',
      query: trends([event('order requested')], {
        display: 'ActionsBarValue',
        breakdown: 'utmSource',
      }),
    },
  ]
}

// ── Upsert ───────────────────────────────────────────────────────────────────

interface Action {
  id: number
  name: string
  deleted?: boolean
}
interface Dashboard {
  id: number
  name: string
  deleted?: boolean
}
interface DashboardDetail extends Dashboard {
  tiles: { insight: { id: number; name: string | null } | null }[]
}

async function upsertAction(): Promise<number> {
  const steps = ADD_EVENTS.map((e) => ({ event: e }))
  const existing = (await listAll<Action>('/actions/')).find(
    (a) => a.name === ADDED_TO_CART_ACTION && !a.deleted,
  )
  if (existing) {
    await api('PATCH', `/actions/${existing.id}/`, { steps })
    return existing.id
  }
  const created = await api<Action>('POST', '/actions/', {
    name: ADDED_TO_CART_ACTION,
    description: 'Any add to cart: a product, a ready-made box or a built box.',
    steps,
  })
  return created.id
}

async function upsertDashboard(): Promise<number> {
  const existing = (await listAll<Dashboard>('/dashboards/')).find(
    (d) => d.name === DASHBOARD_NAME && !d.deleted,
  )
  if (existing) return existing.id
  const created = await api<Dashboard>('POST', '/dashboards/', {
    name: DASHBOARD_NAME,
    description:
      'Collections, products, carts, checkout and the order pipeline. Built by backend/scripts/posthog-dashboard.ts — edit there.',
    pinned: true,
  })
  return created.id
}

async function main() {
  if (!API_KEY || !PROJECT_ID) {
    console.error(
      'Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in backend/.env — see .env.example.',
    )
    process.exit(1)
  }

  const actionId = await upsertAction()
  const dashboardId = await upsertDashboard()
  const detail = await api<DashboardDetail>('GET', `/dashboards/${dashboardId}/`)
  const onDashboard = new Map(
    detail.tiles
      .map((t) => t.insight)
      .filter((i): i is { id: number; name: string } => Boolean(i?.name))
      .map((i) => [i.name, i.id]),
  )

  for (const def of insights(actionId)) {
    const id = onDashboard.get(def.name)
    if (id) {
      await api('PATCH', `/insights/${id}/`, {
        description: def.description,
        query: def.query,
      })
      console.log(`  updated  ${def.name}`)
    } else {
      await api('POST', '/insights/', { ...def, dashboards: [dashboardId] })
      console.log(`  created  ${def.name}`)
    }
  }

  console.log(`\n${DASHBOARD_NAME}: ${HOST}/project/${PROJECT_ID}/dashboard/${dashboardId}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
