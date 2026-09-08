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

export const createOrderSchema = z.object({
  contact: z.object({
    name: shortText,
    email: z.string().trim().email().max(320),
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
})

export const ORDER_STATUSES = ['new', 'quoted', 'confirmed', 'cancelled'] as const

export const updateOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES),
})

export type CreateOrderBody = z.infer<typeof createOrderSchema>
export type UpdateOrderBody = z.infer<typeof updateOrderSchema>
export type OrderStatus = (typeof ORDER_STATUSES)[number]
