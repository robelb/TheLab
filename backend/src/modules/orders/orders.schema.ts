import { z } from 'zod'
import {
  INVOICE_COUNTRIES,
  SHIPPING_COUNTRIES,
  normalizeVatId,
  vatIdLooksValid,
  vatIdRequired,
} from '../../lib/shipping.js'

/**
 * What the shop sends when someone asks for a box.
 *
 * Deliberately absent: `subtotal`, `shipping` and `total`. Those are computed
 * here from the line prices — a total the client chose is a number nobody can
 * stand behind, and this row is what a quote gets written from.
 */

const money = z.number().finite().min(0).max(1_000_000)
const shortText = z.string().trim().min(1).max(200)

/** Today's date in Germany, `YYYY-MM-DD` — the calendar our customers and invoices use. */
export function todayInBerlin(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now)
}

/**
 * A calendar date, `YYYY-MM-DD`, that exists.
 *
 * Free text used to be accepted here, and it ends up on the invoice: "ASAP" or
 * "15.12." made the PDF throw on every attempt, for good, because an issued
 * invoice cannot be changed.
 */
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'The date must be a date (YYYY-MM-DD).')
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
  }, 'That date does not exist.')

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

/** Longest greeting the card printer takes; the builder counts down to it. */
export const GREETING_MAX_LENGTH = 500

/** The card that goes in the box, and what it says. We do the formatting. */
const greetingCardSchema = boxLineSchema.extend({
  message: z.string().max(GREETING_MAX_LENGTH).default(''),
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
  greetingCard: greetingCardSchema.nullish(),
  /** Optional logo stickers; skipped boxes have none. */
  stickers: boxLineSchema.nullish(),
  /**
   * The logo for the stickers, when the shopper uploaded it with the request.
   * Absent with stickers means they send it afterwards.
   */
  stickerLogo: z
    .object({
      url: z.string().trim().url().max(2048),
      name: z.string().trim().max(200).nullish(),
    })
    .nullish(),
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
 * Where the visit came from, as the browser captured it at the last ad click.
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
  entrySlug: z.string().trim().max(80).nullish(),
})

const optionalText = (max: number) => z.string().trim().max(max).nullish()

/** Who the invoice is made out to. The country decides the VAT. */
const billingSchema = z.object({
  company: shortText,
  name: optionalText(200),
  street: z.string().trim().min(1).max(300),
  line2: optionalText(300),
  zip: z.string().trim().min(1).max(32),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().toUpperCase().length(2),
  vatId: z
    .string()
    .max(32)
    .transform((v) => normalizeVatId(v) || null)
    .nullish(),
  poNumber: optionalText(64),
  email: z.string().trim().email().max(320).nullish(),
})

/**
 * How the boxes travel. `bulk` sends everything to the delivery address;
 * `individual` sends each box to its own recipient; `mixed` sends `bulkBoxes`
 * of them together and the rest one by one. Recipient addresses for
 * individual boxes are sent after the request.
 */
const shippingSchema = z.object({
  method: z.enum(['bulk', 'individual', 'mixed']).default('bulk'),
  bulkBoxes: z.number().int().min(1).max(100_000).nullish(),
})

export const createOrderSchema = z.object({
  contact: z.object({
    name: shortText,
    firstName: optionalText(100),
    lastName: optionalText(100),
    email: z.string().trim().email().max(320),
    /** Guests have no company record behind them, so they type the name. */
    company: z.string().trim().max(200).nullish(),
    phone: z.string().trim().max(40).nullish(),
    position: optionalText(120),
  }),
  billing: billingSchema.nullish(),
  delivery: z
    .object({
      sameAsBilling: z.boolean().nullish(),
      address: z.string().trim().max(300).nullish(),
      line2: z.string().trim().max(300).nullish(),
      city: z.string().trim().max(120).nullish(),
      zip: z.string().trim().max(32).nullish(),
      country: z.string().trim().toUpperCase().max(120).nullish(),
      neededBy: isoDate
        .refine((v) => v >= todayInBerlin(), 'The delivery date cannot be in the past.')
        .nullish(),
      notes: z.string().trim().max(2000).nullish(),
    })
    .nullish(),
  shipping: shippingSchema.nullish(),
  items: z.array(itemSchema).min(1, 'There is nothing to request').max(100),
  /** Everything is priced in euros; anything else would be invoiced wrongly. */
  currency: z.literal('EUR').default('EUR'),
  locale: z.enum(['de', 'en']).default('en'),
  /**
   * Ignored — kept so an older client's payload still validates. Where a
   * request came from is decided on the server from `collectionSlug`.
   */
  source: z.enum(['storefront', 'funnel']).optional(),
  /** The collection the shopper is buying in, checked against active ones. */
  collectionSlug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .nullish(),
  attribution: attributionSchema.nullish(),
  /** Invoice is the only way to pay today. */
  paymentMethod: z.enum(['invoice']).nullish(),
  /** The privacy notice checkbox. Required from guests, see `guestProblems`. */
  privacyAccepted: z.boolean().optional(),
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

export const PAYMENT_STATUSES = ['unpaid', 'paid'] as const

export const updateOrderSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  })
  .refine((b) => b.status || b.paymentStatus, 'Nothing to change')

/**
 * The price a super admin agrees to, line by line.
 *
 * Each entry names a stored line by its position. Lines left out keep the
 * price they were requested at.
 */
export const confirmOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        index: z.number().int().min(0).max(99),
        unitPrice: money,
      }),
    )
    .max(100)
    .default([]),
  shipping: money,
  /**
   * The VAT rate in percent, when it is not the usual one for the invoice
   * country (19 % in Germany, 0 % elsewhere). Left out, the usual one applies.
   */
  vatRate: z.number().finite().min(0).max(100).optional(),
  /**
   * When the invoice is due, `YYYY-MM-DD`. Left out, it is the usual payment
   * term from the invoice date. Checked against today in the service.
   */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'The due date must be a date (YYYY-MM-DD).')
    .optional(),
  /**
   * Who to invoice, for a request that came in without a billing address —
   * shop orders from before checkout asked for one. Ignored when the order
   * already has one.
   */
  billing: billingSchema.optional(),
})

/**
 * What a super admin can fill in after a request arrived, before it is
 * confirmed: what the customer promised to send later.
 *
 * - `billing`: fields of the invoice address to change — a PO number that
 *   came by email, a corrected VAT ID or address. Merged into what is there.
 * - `addressesLater`: false once the recipient addresses have arrived.
 * - `stickerLogos`: the logo for the stickers of a box line, by its position.
 * - `cardMessages`: the greeting-card text of a box line, sent by email.
 * - `designAgreed`: the artwork for custom-design items is agreed.
 *
 * Only `billing` is locked once the order is confirmed (it is on the
 * invoice); the rest is production detail and can arrive any time.
 */
export const orderDetailsSchema = z
  .object({
    billing: billingSchema.partial().optional(),
    addressesLater: z.boolean().optional(),
    stickerLogos: z
      .array(
        z.object({
          index: z.number().int().min(0).max(99),
          logo: z
            .object({
              url: z.string().trim().url().max(2048),
              name: z.string().trim().max(200).nullish(),
            })
            .nullable(),
        }),
      )
      .max(100)
      .optional(),
    cardMessages: z
      .array(
        z.object({
          index: z.number().int().min(0).max(99),
          message: z.string().max(GREETING_MAX_LENGTH),
        }),
      )
      .max(100)
      .optional(),
    designAgreed: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.billing !== undefined ||
      b.addressesLater !== undefined ||
      b.designAgreed !== undefined ||
      b.stickerLogos?.length ||
      b.cardMessages?.length,
    'Nothing to change',
  )

export const resendEmailSchema = z.object({
  template: z.enum(['received', 'confirmed']),
})

export type CreateOrderBody = z.infer<typeof createOrderSchema>
export type UpdateOrderBody = z.infer<typeof updateOrderSchema>
export type ConfirmOrderBody = z.infer<typeof confirmOrderSchema>
export type OrderDetailsBody = z.infer<typeof orderDetailsSchema>
export type OrderStatus = (typeof ORDER_STATUSES)[number]
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number]

/**
 * What a guest has to give us that a signed-in shopper does not.
 *
 * A guest's request is the only record we will ever have of them: no account
 * to look the rest up in later. So everything an invoice needs is asked for up
 * front. Returns the first problem, or null.
 */
export function guestProblems(body: CreateOrderBody): string | null {
  const c = body.contact
  if (!c.firstName?.trim() || !c.lastName?.trim()) return 'First and last name are required'
  if (!c.phone?.trim()) return 'A phone number is required'
  if (!body.billing) return 'A billing address is required'
  const d = body.delivery
  // Individually sent boxes have no single delivery address; theirs come later.
  if (body.shipping?.method !== 'individual' && !d?.sameAsBilling) {
    if (!d?.address?.trim() || !d.zip?.trim() || !d.city?.trim()) {
      return 'A delivery address is required'
    }
  }
  if (!body.privacyAccepted) return 'Please accept the privacy notice'
  return null
}

/** How many gift boxes the request holds, counting each box line's quantity. */
export function boxCount(items: CreateOrderBody['items']): number {
  return items.reduce((sum, item) => sum + (item.box ? item.quantity : 0), 0)
}

/**
 * Where the shipping estimate is for: the delivery address, or the billing
 * address when it ships there. For individual boxes the delivery country is
 * where the recipients are.
 */
export function destinationCountry(body: CreateOrderBody): string {
  const d = body.delivery
  const country =
    d?.sameAsBilling && body.shipping?.method !== 'individual'
      ? body.billing?.country
      : d?.country
  return (country ?? body.billing?.country ?? 'DE').trim().toUpperCase()
}

/**
 * What an invoice address has to satisfy, wherever it was entered — at
 * checkout, in the confirm dialog, or edited afterwards: a country we invoice
 * to, and a VAT ID wherever the invoice goes out without VAT.
 */
export function billingProblems(billing: {
  country: string
  vatId?: string | null
}): string | null {
  if (!INVOICE_COUNTRIES.includes(billing.country)) {
    return 'We cannot invoice to that country yet'
  }
  if (vatIdRequired(billing.country) && !billing.vatId) {
    return 'A VAT ID is required for invoices to EU countries outside Germany'
  }
  if (billing.vatId && !vatIdLooksValid(billing.country, billing.vatId)) {
    return 'The VAT ID does not match the billing country'
  }
  return null
}

/**
 * Checks every request has to pass, signed in or not: an invoice country we
 * make invoices out to, a VAT ID wherever the invoice goes out without VAT,
 * a shipping choice that fits the boxes, and a destination we ship to.
 * Returns the first problem, or null.
 */
export function checkoutProblems(body: CreateOrderBody): string | null {
  if (body.billing) {
    const problem = billingProblems(body.billing)
    if (problem) return problem
  }

  const method = body.shipping?.method ?? 'bulk'
  const boxes = boxCount(body.items)
  if (method === 'individual' && boxes < 1) {
    return 'Individual shipping is for gift boxes'
  }
  // Each parcel is one box to one recipient; a loose product has no parcel
  // and no address to go to. Mixed shipping sends them with the bulk part.
  if (method === 'individual' && body.items.some((item) => !item.box)) {
    return 'Single products cannot be sent individually. Choose bulk or mixed shipping.'
  }
  if (method === 'mixed') {
    if (boxes < 2) return 'Mixed shipping needs at least two boxes'
    const together = body.shipping?.bulkBoxes
    if (!together || together >= boxes) {
      return 'Say how many boxes go to the delivery address; the rest are sent individually'
    }
  }
  if (!SHIPPING_COUNTRIES.includes(destinationCountry(body))) {
    return 'We cannot deliver to that country yet'
  }
  return null
}
