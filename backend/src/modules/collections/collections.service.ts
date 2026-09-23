import { and, asc, eq } from 'drizzle-orm'
import { db, rawSql } from '../../db/index.js'
import { collections, type Collection } from '../../db/schema/index.js'
import { getProductsByIds } from '../products/products.service.js'
import type { ProductWithCategory } from '../../types/product.js'
import type {
  CreateCollectionBody,
  UpdateCollectionBody,
} from './collections.schema.js'

/**
 * A landing collection with its headline boxes already loaded.
 *
 * The page it feeds is the first thing an ad click sees, so it is one request:
 * the copy, the tag to filter the catalogue by, and the bundles to show —
 * contents and all.
 */
export interface HydratedCollection extends Collection {
  featuredBundles: ProductWithCategory[]
}

export async function getCollectionBySlug(
  slug: string,
  companyId?: string,
): Promise<HydratedCollection | null> {
  const rows = await db
    .select()
    .from(collections)
    .where(eq(collections.slug, slug))
    .limit(1)

  if (rows.length === 0) return null
  return hydrate(rows[0], companyId)
}

/**
 * Every collection, with its headline boxes loaded.
 *
 * Hydrated like the single read is, because the callers are the same shape of
 * page: the dashboard lists these to say which boxes each campaign leads with,
 * and a row without them is a row that cannot answer that. The products are
 * fetched once for the whole list rather than once per collection — there are
 * only ever a handful of these, but the N+1 would be for nothing.
 */
export async function listCollections(
  opts: { activeOnly?: boolean; companyId?: string } = {},
): Promise<HydratedCollection[]> {
  const rows = await db
    .select()
    .from(collections)
    .where(opts.activeOnly ? eq(collections.active, true) : undefined)
    .orderBy(asc(collections.sortOrder), asc(collections.slug))

  const ids = [...new Set(rows.flatMap((r) => r.featuredBundleIds ?? []))]
  if (ids.length === 0) {
    return rows.map((row) => ({ ...row, featuredBundles: [] }))
  }

  const products = await getProductsByIds(ids, opts.companyId)
  const byId = new Map(products.map((p) => [p.id, p]))

  return rows.map((row) => ({
    ...row,
    // Configured order wins, and an id that no longer resolves is dropped
    // rather than left as a gap.
    featuredBundles: (row.featuredBundleIds ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is ProductWithCategory => Boolean(p)),
  }))
}

async function hydrate(
  row: Collection,
  companyId?: string,
): Promise<HydratedCollection> {
  const ids = row.featuredBundleIds ?? []
  if (ids.length === 0) return { ...row, featuredBundles: [] }

  const products = await getProductsByIds(ids, companyId)
  // `getProductsByIds` returns whatever it found, in whatever order. The
  // configured order is the one marketing chose, so restore it and drop ids
  // that no longer resolve rather than showing a gap.
  const byId = new Map(products.map((p) => [p.id, p]))
  const featuredBundles = ids
    .map((id) => byId.get(id))
    .filter((p): p is ProductWithCategory => Boolean(p))

  return { ...row, featuredBundles }
}

export async function createCollection(
  input: CreateCollectionBody,
): Promise<Collection> {
  const [created] = await db
    .insert(collections)
    .values({
      slug: input.slug,
      title: input.title,
      subtitle: input.subtitle ?? null,
      tag: input.tag,
      featuredBundleIds: input.featuredBundleIds,
      defaultLocale: input.defaultLocale,
      active: input.active,
      allowCustomization: input.allowCustomization,
      sortOrder: input.sortOrder,
    })
    .returning()
  return created
}

export async function updateCollection(
  id: string,
  input: UpdateCollectionBody,
): Promise<Collection | null> {
  const values: Record<string, unknown> = {}
  if (input.slug !== undefined) values.slug = input.slug
  if (input.title !== undefined) values.title = input.title
  if (input.subtitle !== undefined) values.subtitle = input.subtitle ?? null
  if (input.tag !== undefined) values.tag = input.tag
  if (input.featuredBundleIds !== undefined) {
    values.featuredBundleIds = input.featuredBundleIds
  }
  if (input.defaultLocale !== undefined) {
    values.defaultLocale = input.defaultLocale
  }
  if (input.active !== undefined) values.active = input.active
  if (input.allowCustomization !== undefined) {
    values.allowCustomization = input.allowCustomization
  }
  if (input.sortOrder !== undefined) values.sortOrder = input.sortOrder

  const [updated] = await db
    .update(collections)
    .set(values)
    .where(eq(collections.id, id))
    .returning()
  return updated ?? null
}

export async function deleteCollection(id: string): Promise<boolean> {
  const deleted = await db
    .delete(collections)
    .where(eq(collections.id, id))
    .returning({ id: collections.id })
  return deleted.length > 0
}

/** Guard for the public read: an ended campaign's page should not still serve. */
export async function getActiveCollectionBySlug(
  slug: string,
  companyId?: string,
): Promise<HydratedCollection | null> {
  const rows = await db
    .select()
    .from(collections)
    .where(and(eq(collections.slug, slug), eq(collections.active, true)))
    .limit(1)

  if (rows.length === 0) return null
  return hydrate(rows[0], companyId)
}

// ---------------------------------------------------------------------------
// What appears on a collection's page
// ---------------------------------------------------------------------------

/**
 * A collection's page is filled by its tag, so belonging to one is the same
 * thing as carrying that tag. Managing it product by product from the catalogue
 * meant knowing that, and remembering the exact spelling; these two functions
 * let the collection own the relationship instead.
 */

async function tagOf(collectionId: string): Promise<string | null> {
  const [row] = await db
    .select({ tag: collections.tag })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1)
  return row?.tag ?? null
}

/** Everything currently carrying this collection's tag. */
export async function listCollectionMembers(
  collectionId: string,
  companyId?: string,
): Promise<ProductWithCategory[]> {
  const tag = await tagOf(collectionId)
  if (!tag) return []

  const rows = (await rawSql`
    SELECT id FROM products
     WHERE tags @> ${JSON.stringify([tag])}::jsonb
     ORDER BY kind DESC, name ASC
  `) as { id: string }[]

  return getProductsByIds(
    rows.map((r) => r.id),
    companyId,
  )
}

/**
 * Put products into a collection, or take them out.
 *
 * Adding is idempotent and order-preserving: a product already carrying the tag
 * is left alone rather than ending up with it twice. Removing strips only this
 * collection's tag, so a product that belongs to Christmas and to Onboarding
 * keeps the other one.
 */
export async function setCollectionMembership(
  collectionId: string,
  changes: { add?: string[]; remove?: string[] },
): Promise<ProductWithCategory[]> {
  const tag = await tagOf(collectionId)
  if (!tag) return []

  const add = [...new Set(changes.add ?? [])]
  const remove = [...new Set(changes.remove ?? [])].filter(
    (id) => !add.includes(id),
  )

  if (add.length > 0) {
    await rawSql`
      UPDATE products
         SET tags = tags || ${JSON.stringify([tag])}::jsonb
       WHERE id = ANY(${add}::uuid[])
         AND NOT (tags @> ${JSON.stringify([tag])}::jsonb)
    `
  }

  if (remove.length > 0) {
    await rawSql`
      UPDATE products
         SET tags = (
           SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
             FROM jsonb_array_elements(tags) AS value
            WHERE value <> ${JSON.stringify(tag)}::jsonb
         )
       WHERE id = ANY(${remove}::uuid[])
         AND tags @> ${JSON.stringify([tag])}::jsonb
    `
  }

  return listCollectionMembers(collectionId)
}
