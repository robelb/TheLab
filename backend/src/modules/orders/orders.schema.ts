import { z } from 'zod'

/**
 * What the shop sends when someone asks for a box.
 *
 * Deliberately absent: `subtotal`, `shipping` and `total`. Those are computed
 * here from the line prices — a total the client chose is a number nobody can
 * stand behind, and this row is what a quote gets written from.
 */

const money = z.number().finite().min(0).max(1_000_000)
const shortText = z.string().trim().min(1).max(200)

/** One product inside a built box, priced as it was when the box was built. */
const boxLineSchema = z.object({
  productId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(300),
  price: money,
  currency: z.string().trim().max(8).nullish(),
  quantity: z.number().int().min(1).max(10_000),
  image: z.string().trim().max(2048).nullish(),
  customizedImage: z.string().trim().max(2048).nullish(),
  customPrint: z.boolean().nullish(),
})

/**
 * A built box. `designs` and `packagingLayout` are passed through unchecked:
 * they are the editor's own structures, stored so the print shop can see what
 * was approved, and validating them here would duplicate a contract that already
 * lives in `placementLayout.ts` and would break the moment the editor gains a
 * field.
 */
const boxSchema = z.object({
  campaignId: z.string().nullish(),
  /**
   * The pre-configured box this was opened from, when it was.
   *
   * Only a claim: the server checks the contents still match before charging
   * the bundle's price rather than the sum of its parts.
   */
  bundleId: z.string().uuid().nullish(),
  lines: z.array(boxLineSchema).max(64),
  packaging: boxLineSchema.nullish(),
  filling: boxLineSchema.nullish(),
  packagingPrompt: z.string().max(4000).nullish(),
  packagingLayout: z.unknown().nullish(),
  designs: z.unknown().nullish(),
})

/**
 * A design made for one product on its own, outside a box.
 *
 * `layout` passes through unchecked for the same reason the box's does: it is
 * the editor's structure, kept so the print shop can see what was approved, and
 * re-validating it here would duplicate a contract that already lives in
 * `placementLayout.ts`.
 */
const designSchema = z.object({
  image: z.string().trim().max(2048).nullish(),
  flat: z.string().trim().max(2048).nullish(),
  photoreal: z.string().trim().max(2048).nullish(),
  prompt: z.string().max(4000).nullish(),
  layout: z.unknown().nullish(),
  logoUrl: z.string().trim().max(2048).nullish(),
})

const itemSchema = z.object({
  productId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(300),
  sku: z.string().trim().max(64).nullish(),
  image: z.string().trim().max(2048).nullish(),
  unitPrice: money,
  quantity: z.number().int().min(1).max(10_000),
  currency: z.string().trim().max(8).nullish(),
  box: boxSchema.nullish(),
  /** Set when this single product was branded in the editor. */
  design: designSchema.nullish(),
})

/**
 * Where the visit came from, as the browser captured it at first touch.
 *
 * Every field is optional and bounded: this arrives from a URL anyone can
 * write, on an endpoint that no longer requires an account.
 */
const attributionSchema = z.object({
  gclid: z.string().trim().max(256).nullish(),
  fbclid: z.string().trim().max(256).nullish(),
  msclkid: z.string().trim().max(256).nullish(),
  utmSource: z.string().trim().max(256).nullish(),
  utmMedium: z.string().trim().max(256).nullish(),
  utmCampaign: z.string().trim().max(256).nullish(),
  utmTerm: z.string().trim().max(256).nullish(),
  utmContent: z.string().trim().max(256).nullish(),
  landingPath: z.string().trim().max(2048).nullish(),
  referrer: z.string().trim().max(2048).nullish(),
  firstSeenAt: z.string().trim().max(64).nullish(),
  posthogDistinctId: z.string().trim().max(256).nullish(),
  guestSessionId: z.string().trim().max(64).nullish(),
})

export const createOrderSchema = z.object({
  contact: z.object({
    name: shortText,
    email: z.string().trim().email().max(320),
    /** Guests have no company record behind them, so they type the name. */
    company: z.string().trim().max(200).nullish(),
    phone: z.string().trim().max(40).nullish(),
  }),
  delivery: z
    .object({
      address: z.string().trim().max(300).nullish(),
      city: z.string().trim().max(120).nullish(),
      zip: z.string().trim().max(32).nullish(),
      country: z.string().trim().max(120).nullish(),
      neededBy: z.string().trim().max(64).nullish(),
      notes: z.string().trim().max(2000).nullish(),
    })
    .nullish(),
  items: z.array(itemSchema).min(1, 'There is nothing to request').max(100),
  currency: z.string().trim().min(1).max(8).default('EUR'),
  locale: z.enum(['de', 'en']).default('en'),
  source: z.enum(['storefront', 'funnel']).default('storefront'),
  collectionSlug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .nullish(),
  attribution: attributionSchema.nullish(),
  /**
   * Honeypot. A real form leaves this empty because nothing renders it; a bot
   * filling every field in the payload gives itself away.
   *
   * Accepted rather than rejected here on purpose: a validation error tells the
   * script exactly which field caught it. The router answers as if it worked
   * and records nothing.
   */
  website: z.string().max(500).optional(),
})

export const ORDER_STATUSES = ['new', 'quoted', 'confirmed', 'cancelled'] as const

export const updateOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES),
})

export type CreateOrderBody = z.infer<typeof createOrderSchema>
export type UpdateOrderBody = z.infer<typeof updateOrderSchema>
export type OrderStatus = (typeof ORDER_STATUSES)[number]
