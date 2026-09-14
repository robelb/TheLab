import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
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

export async function listCollections(
  opts: { activeOnly?: boolean } = {},
): Promise<Collection[]> {
  return db
    .select()
    .from(collections)
    .where(opts.activeOnly ? eq(collections.active, true) : undefined)
    .orderBy(asc(collections.sortOrder), asc(collections.slug))
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
