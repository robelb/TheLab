import { randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { products, sharedDesigns } from '../../db/schema/index.js'
import type { NewSharedDesign, SharedDesign } from '../../db/schema/index.js'
import { normalizePublicImageUrl } from '../../lib/publicImageUrl.js'
import { updateProduct } from '../products/products.service.js'
import type { CreateShareBody } from './share.schema.js'

/** Short, URL-safe public token backing a share link (~11 chars, 64 bits). */
function generateSlug(): string {
  return randomBytes(8).toString('base64url')
}

export interface ShareView {
  slug: string
  imageUrl: string
  title: string | null
  prompt: string | null
  status: string
  brand: SharedDesign['brand']
  createdAt: Date
  product: {
    id: string
    name: string
    price: number
    currency: string
    tagline: string | null
  } | null
}

/** A generated design as listed in the dashboard (no product hydration). */
export interface ShareSummary {
  slug: string
  imageUrl: string
  prompt: string | null
  status: string
  createdAt: Date
}

/**
 * All generated designs for a product, newest first. Dashboard-only — the shop
 * product response never includes these; a pending design lives here until the
 * user saves it into the product gallery.
 */
export async function listSharesForProduct(
  productId: string,
): Promise<ShareSummary[]> {
  const rows = await db
    .select({
      slug: sharedDesigns.slug,
      imageUrl: sharedDesigns.imageUrl,
      prompt: sharedDesigns.prompt,
      status: sharedDesigns.status,
      createdAt: sharedDesigns.createdAt,
    })
    .from(sharedDesigns)
    .where(eq(sharedDesigns.productId, productId))
    .orderBy(desc(sharedDesigns.createdAt))

  return rows.map((r) => ({
    ...r,
    imageUrl: normalizePublicImageUrl(r.imageUrl) ?? r.imageUrl,
  }))
}

/**
 * Delete a generated design and remove its image from the product gallery too,
 * so a rejected/removed image leaves the shop as well — never a "half-deleted"
 * image that's gone from the design list but still live in the catalog. Keeps
 * at least one gallery image (won't strip a product down to an empty gallery).
 */
export async function deleteShare(slug: string): Promise<boolean> {
  const [row] = await db
    .select({
      id: sharedDesigns.id,
      productId: sharedDesigns.productId,
      imageUrl: sharedDesigns.imageUrl,
    })
    .from(sharedDesigns)
    .where(eq(sharedDesigns.slug, slug))
    .limit(1)

  if (!row) return false

  await db.delete(sharedDesigns).where(eq(sharedDesigns.id, row.id))

  if (row.productId) {
    const [p] = await db
      .select({ image: products.image, images: products.images })
      .from(products)
      .where(eq(products.id, row.productId))
      .limit(1)
    if (p) {
      const gallery = p.images && p.images.length > 0 ? p.images : [p.image]
      // row.imageUrl is stored normalized; normalize gallery entries to match.
      const filtered = gallery.filter(
        (u) => (normalizePublicImageUrl(u) ?? u) !== row.imageUrl,
      )
      if (filtered.length !== gallery.length && filtered.length > 0) {
        await updateProduct(row.productId, { images: filtered })
      }
    }
  }

  return true
}

/**
 * Create (or refresh) a shareable design for an image and return its slug.
 * Image URLs are normalized so every code path stores/compares the same form.
 * When a `productId` is given, this upserts by (productId, imageUrl): one design
 * row per product image, so re-sharing the same image reuses its slug and just
 * refreshes the brand snapshot instead of piling up duplicates.
 */
export async function createShare(
  input: CreateShareBody,
): Promise<{ slug: string }> {
  const imageUrl = normalizePublicImageUrl(input.imageUrl) ?? input.imageUrl

  if (input.productId) {
    const [existing] = await db
      .select({ id: sharedDesigns.id, slug: sharedDesigns.slug })
      .from(sharedDesigns)
      .where(
        and(
          eq(sharedDesigns.productId, input.productId),
          eq(sharedDesigns.imageUrl, imageUrl),
        ),
      )
      .limit(1)

    if (existing) {
      const updates: Partial<NewSharedDesign> = { updatedAt: new Date() }
      if (input.brand !== undefined) updates.brand = input.brand
      if (input.prompt !== undefined) updates.prompt = input.prompt
      if (input.domain !== undefined) updates.domain = input.domain
      if (input.title !== undefined) updates.title = input.title
      await db
        .update(sharedDesigns)
        .set(updates)
        .where(eq(sharedDesigns.id, existing.id))
      return { slug: existing.slug }
    }
  }

  const slug = generateSlug()
  await db.insert(sharedDesigns).values({
    slug,
    imageUrl,
    productId: input.productId ?? null,
    domain: input.domain ?? null,
    title: input.title ?? null,
    prompt: input.prompt ?? null,
    brand: input.brand ?? null,
    status: 'pending',
  })

  return { slug }
}

/** Public viewer payload for a slug (hydrates minimal product context). */
export async function getShareBySlug(slug: string): Promise<ShareView | null> {
  const [row] = await db
    .select()
    .from(sharedDesigns)
    .where(eq(sharedDesigns.slug, slug))
    .limit(1)

  if (!row) return null

  let product: ShareView['product'] = null
  if (row.productId) {
    const [p] = await db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        currency: products.currency,
        tagline: products.tagline,
      })
      .from(products)
      .where(eq(products.id, row.productId))
      .limit(1)

    if (p) {
      product = {
        id: p.id,
        name: p.name,
        price: Number(p.price),
        currency: p.currency,
        tagline: p.tagline || null,
      }
    }
  }

  return {
    slug: row.slug,
    imageUrl: normalizePublicImageUrl(row.imageUrl) ?? row.imageUrl,
    title: row.title,
    prompt: row.prompt,
    status: row.status,
    brand: row.brand,
    createdAt: row.createdAt,
    product,
  }
}

/**
 * Promote a pending share to `saved`: attach its image to the linked product's
 * gallery (dedup) so it starts appearing in product responses, then flip the
 * status. Idempotent — safe to call more than once.
 */
export async function saveShare(slug: string): Promise<ShareView> {
  const [row] = await db
    .select()
    .from(sharedDesigns)
    .where(eq(sharedDesigns.slug, slug))
    .limit(1)

  if (!row) throw new Error('Share not found')

  if (row.productId) {
    // Read the RAW stored gallery (not getProductById, which normalizes image
    // URLs) so the dedup compares like-for-like with the stored share URL.
    const [p] = await db
      .select({ image: products.image, images: products.images })
      .from(products)
      .where(eq(products.id, row.productId))
      .limit(1)
    if (p) {
      const gallery = p.images && p.images.length > 0 ? p.images : [p.image]
      // Compare in normalized form so a stored localhost/Supabase URL variant
      // doesn't slip past the dedup and get appended twice.
      const normalized = gallery.map((u) => normalizePublicImageUrl(u) ?? u)
      if (!normalized.includes(row.imageUrl)) {
        await updateProduct(row.productId, {
          images: [...gallery, row.imageUrl],
        })
      }
    }
  }

  await db
    .update(sharedDesigns)
    .set({ status: 'saved', updatedAt: new Date() })
    .where(eq(sharedDesigns.id, row.id))

  const view = await getShareBySlug(slug)
  if (!view) throw new Error('Share not found')
  return view
}
