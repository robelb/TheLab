import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  max,
  min,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db, rawSql } from '../../db/index.js'
import {
  brandCustomizations,
  categories,
  companyProductImages,
  productComponents,
  products,
} from '../../db/schema/index.js'
import { hexToLab } from '../../lib/color.js'
import { normalizePublicImageUrl } from '../../lib/publicImageUrl.js'
import {
  NOT_SUPPLY_SQL,
  PACKAGING_SLUG,
  SUPPLY_CATEGORY_SLUGS,
} from '../../lib/supplies.js'
import { embedText } from '../../services/embedding.js'
import { captionImageForSearch } from '../../services/imageCaption.js'
import { parseSearchQuery } from '../../services/queryParser.js'
import type {
  BundleComponent,
  InterpretedQuery,
  ListProductsParams,
  ListProductsResult,
  ProductWithCategory,
  RawProductRow,
} from '../../types/product.js'
import {
  rawRowToProductRow,
  toProductWithCategory,
} from '../../types/product.js'

export type {
  BundleComponent,
  ListProductsParams,
  ListProductsResult,
  ProductWithCategory,
}

// ---------------------------------------------------------------------------
// Shared select shape (avoids repeating column list across queries)
// ---------------------------------------------------------------------------

const productSelect = {
  id: products.id,
  sourceId: products.sourceId,
  variantId: products.variantId,
  sku: products.sku,
  name: products.name,
  tagline: products.tagline,
  price: products.price,
  currency: products.currency,
  stock: products.stock,
  categoryId: products.categoryId,
  image: products.image,
  images: products.images,
  customizedImage: products.customizedImage,
  description: products.description,
  details: products.details,
  isFeatured: products.isFeatured,
  dominantColor: products.dominantColor,
  kind: products.kind,
  tags: products.tags,
  minQuantity: products.minQuantity,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
  categoryName: categories.name,
  categorySlug: categories.slug,
} as const

// ---------------------------------------------------------------------------
// Filter builders
// ---------------------------------------------------------------------------

/**
 * Supplies (the box, the filling material) are products, but they belong to
 * building a box rather than to the catalog — so every shop-facing read drops
 * their categories. `listSupplies` is the one path that asks for them on
 * purpose, and direct lookups (`by-ids`, `/:id`) still resolve them so a cart
 * holding one can hydrate.
 */
const notASupply = notInArray(categories.slug, SUPPLY_CATEGORY_SLUGS)

function buildNonTextFilters(params: ListProductsParams) {
  // `or(...)` narrows to undefined when handed nothing, which `and(...)` accepts.
  const conditions: (SQL | undefined)[] = params.includeSupplies
    ? []
    : [notASupply]

  if (params.categories?.length) {
    // Match any of the selected categories (by slug or name).
    conditions.push(
      or(
        ...params.categories.flatMap((c) => {
          const slug = c.toLowerCase()
          return [eq(categories.slug, slug), ilike(categories.name, slug)]
        }),
      ),
    )
  } else if (params.category) {
    const slug = params.category.toLowerCase()
    conditions.push(
      or(eq(categories.slug, slug), ilike(categories.name, slug)),
    )
  }

  if (params.minPrice !== undefined) {
    conditions.push(gte(products.price, String(params.minPrice)))
  }

  if (params.maxPrice !== undefined) {
    conditions.push(lte(products.price, String(params.maxPrice)))
  }

  // Containment (`@>`) rather than the `?` key operator: it takes a bound
  // jsonb parameter cleanly, so a tag arriving from a URL never reaches the
  // query as SQL, and it is the form a GIN index on `tags` can serve.
  if (params.tag) {
    const tag = JSON.stringify([params.tag.toLowerCase()])
    conditions.push(sql`${products.tags} @> ${tag}::jsonb`)
  }

  if (params.kind) {
    conditions.push(eq(products.kind, params.kind))
  }

  if (params.exclude?.length) {
    conditions.push(notInArray(products.id, params.exclude))
  }

  if (params.excludeCategories?.length) {
    conditions.push(notInArray(categories.slug, params.excludeCategories))
  }

  return conditions
}

function buildAllFilters(params: ListProductsParams) {
  const conditions = buildNonTextFilters(params)

  if (params.q) {
    const pattern = `%${params.q}%`
    conditions.push(
      or(
        ilike(products.name, pattern),
        ilike(products.tagline, pattern),
        ilike(products.sku, pattern),
        ilike(categories.name, pattern),
      ),
    )
  }

  return conditions.length > 0 ? and(...conditions) : undefined
}

/**
 * Ordering for the catalog list. Featured products stay pinned first; when a
 * brand color is supplied, the rest are ordered by perceptual (ΔE) closeness to
 * it — squared LAB distance is monotonic with ΔE, so it sorts identically
 * without the sqrt. Products with no extracted color sort last.
 *
 * `pinFeatured` controls the featured tiebreaker under color sort: true for the
 * initial brand color (featured first, then by color); false when the user picks
 * a color to filter by (sort ALL products purely by color, ignoring featured).
 */
function buildListOrder(brandColor?: string, pinFeatured = true): SQL[] {
  const lab = brandColor ? hexToLab(brandColor) : null
  if (!lab) return [desc(products.isFeatured), asc(products.name)]

  const distance = sql`(
    power(${products.colorL} - ${lab.l}, 2) +
    power(${products.colorA} - ${lab.a}, 2) +
    power(${products.colorB} - ${lab.b}, 2)
  ) asc nulls last`
  return pinFeatured
    ? [desc(products.isFeatured), distance, asc(products.name)]
    : [distance, asc(products.name)]
}

// ---------------------------------------------------------------------------
// Customization overlay (per-company branded images)
// ---------------------------------------------------------------------------

/** Login-generated auto-branded hero image per product (one per company). */
async function getCustomizationMap(
  companyId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      productId: brandCustomizations.productId,
      imageUrl: brandCustomizations.imageUrl,
    })
    .from(brandCustomizations)
    .where(eq(brandCustomizations.companyId, companyId))

  return new Map(rows.map((r) => [r.productId, r.imageUrl]))
}

/** Dashboard-generated gallery images per product (many per company), oldest→newest. */
async function getCompanyGalleryMap(
  companyId: string,
): Promise<Map<string, string[]>> {
  const rows = await db
    .select({
      productId: companyProductImages.productId,
      imageUrl: companyProductImages.imageUrl,
    })
    .from(companyProductImages)
    .where(eq(companyProductImages.companyId, companyId))
    .orderBy(asc(companyProductImages.createdAt))

  const map = new Map<string, string[]>()
  for (const r of rows) {
    const list = map.get(r.productId)
    if (list) list.push(r.imageUrl)
    else map.set(r.productId, [r.imageUrl])
  }
  return map
}

const norm = (u: string): string => normalizePublicImageUrl(u) ?? u

/**
 * Overlay a company's OWN generated images onto products so they surface only
 * for that company's logged-in users:
 *   - `images`: base catalog gallery + this company's dashboard gallery (dedup).
 *   - `customizedImage` (hero): the login auto-branded image, else this company's
 *     most recent dashboard image, else unchanged.
 * Other companies / guests never receive these rows, so they see only the base.
 */
function applyCustomizations(
  items: ProductWithCategory[],
  heroes: Map<string, string>,
  galleries: Map<string, string[]>,
): ProductWithCategory[] {
  if (heroes.size === 0 && galleries.size === 0) return items
  return items.map((p) => {
    const hero = heroes.get(p.id)
    const gallery = galleries.get(p.id) ?? []
    if (!hero && gallery.length === 0) return p

    const base = p.images && p.images.length > 0 ? p.images : p.image ? [p.image] : []
    const seen = new Set<string>()
    const images: string[] = []
    for (const u of [...base, ...gallery]) {
      const n = norm(u)
      if (seen.has(n)) continue
      seen.add(n)
      images.push(n)
    }

    const heroUrl = hero ?? (gallery.length ? gallery[gallery.length - 1] : undefined)
    return {
      ...p,
      images,
      customizedImage: heroUrl ? norm(heroUrl) : p.customizedImage,
    }
  })
}

async function withCustomizations(
  data: ProductWithCategory[],
  companyId?: string,
): Promise<ProductWithCategory[]> {
  if (!companyId) return data
  const [heroes, galleries] = await Promise.all([
    getCustomizationMap(companyId),
    getCompanyGalleryMap(companyId),
  ])
  return applyCustomizations(data, heroes, galleries)
}

/**
 * Keep a confirmed design as one of this company's own images for a product.
 *
 * Company-scoped on purpose: the shopper who brands a bottle is branding it for
 * their company, and the global catalog row must stay plain for everybody else.
 * `withCustomizations` folds these rows back into `images` on every read, so a
 * design confirmed here shows up as a source to design on next time round.
 *
 * Idempotent — confirming the same image twice adds one row, not two.
 */
export async function addCompanyProductImage(params: {
  companyId: string
  productId: string
  imageUrl: string
  prompt?: string | null
}): Promise<void> {
  await db
    .insert(companyProductImages)
    .values({
      companyId: params.companyId,
      productId: params.productId,
      imageUrl: params.imageUrl,
      prompt: params.prompt ?? null,
    })
    .onConflictDoNothing({
      target: [
        companyProductImages.companyId,
        companyProductImages.productId,
        companyProductImages.imageUrl,
      ],
    })
}

/**
 * Drop this company's own gallery rows for a product that the caller's new
 * gallery no longer lists.
 *
 * `withCustomizations` unions `company_product_images` back into `images` on
 * every company-scoped read, so trimming `products.images` alone does nothing:
 * the removed URLs reappear on the next fetch. An edit that sets the gallery is
 * authoritative, so the rows behind the dropped entries have to go too.
 *
 * Compares on the normalized URL because that is the form reads hand out (and
 * therefore the form the client sends back), while the rows may still hold the
 * raw `/api/...` or localhost URL they were written with.
 */
async function pruneCompanyProductImages(params: {
  companyId: string
  productId: string
  keepUrls: string[]
}): Promise<void> {
  const rows = await db
    .select({ imageUrl: companyProductImages.imageUrl })
    .from(companyProductImages)
    .where(
      and(
        eq(companyProductImages.companyId, params.companyId),
        eq(companyProductImages.productId, params.productId),
      ),
    )
  if (rows.length === 0) return

  const keep = new Set(params.keepUrls.map(norm))
  const drop = rows.map((r) => r.imageUrl).filter((u) => !keep.has(norm(u)))
  if (drop.length === 0) return

  await db
    .delete(companyProductImages)
    .where(
      and(
        eq(companyProductImages.companyId, params.companyId),
        eq(companyProductImages.productId, params.productId),
        inArray(companyProductImages.imageUrl, drop),
      ),
    )
}

// ---------------------------------------------------------------------------
// Semantic search (vector similarity via pgvector)
// ---------------------------------------------------------------------------

const SEMANTIC_LIMIT = 10

/**
 * Public, brand-agnostic semantic search over the product vector column.
 * Used by campaign assembly to pick a bundle from a free-text brand query.
 * Customization overlay is applied later (domain-aware) during hydration.
 */
export async function searchProductsByText(
  query: string,
  limit = 6,
  /** Only products carrying this tag — a landing page's own range. */
  opts: { tag?: string } = {},
): Promise<ProductWithCategory[]> {
  return semanticSearch(
    query,
    {
      page: 1,
      limit,
      companyId: undefined,
      tag: opts.tag,
      // A landing page tags its boxes too; a box built out of boxes is not one.
      kind: opts.tag ? 'single' : undefined,
    },
    limit,
  )
}

async function semanticSearch(
  query: string,
  params: ListProductsParams,
  limit: number = SEMANTIC_LIMIT,
): Promise<ProductWithCategory[]> {
  const vectorStr = `[${(await embedText(query)).join(',')}]`

  const clauses: string[] = ['p.embedding IS NOT NULL']
  if (!params.includeSupplies) clauses.push(NOT_SUPPLY_SQL)

  if (params.categories?.length) {
    const list = params.categories
      .map((c) => `'${c.toLowerCase().replace(/'/g, "''")}'`)
      .join(', ')
    clauses.push(`(c.slug IN (${list}) OR LOWER(c.name) IN (${list}))`)
  } else if (params.category) {
    const safe = params.category.toLowerCase().replace(/'/g, "''")
    clauses.push(`(c.slug = '${safe}' OR LOWER(c.name) = '${safe}')`)
  }
  if (params.minPrice !== undefined) {
    clauses.push(`p.price >= ${Number(params.minPrice)}`)
  }
  if (params.maxPrice !== undefined) {
    clauses.push(`p.price <= ${Number(params.maxPrice)}`)
  }
  if (params.tag) {
    const safe = JSON.stringify([params.tag.toLowerCase()]).replace(/'/g, "''")
    clauses.push(`p.tags @> '${safe}'::jsonb`)
  }
  if (params.kind) {
    const safe = params.kind.replace(/'/g, "''")
    clauses.push(`p.kind = '${safe}'`)
  }
  if (params.exclude?.length) {
    // Validated as uuids by the query schema; re-checked here because this
    // clause is spliced into the SQL rather than bound.
    const ids = params.exclude.filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    if (ids.length > 0) {
      clauses.push(`p.id NOT IN (${ids.map((id) => `'${id}'`).join(', ')})`)
    }
  }
  if (params.excludeCategories?.length) {
    // Slugs only, per the query schema; re-checked for the same reason.
    const slugs = params.excludeCategories.filter((s) => /^[a-z0-9-]+$/.test(s))
    if (slugs.length > 0) {
      clauses.push(`c.slug NOT IN (${slugs.map((s) => `'${s}'`).join(', ')})`)
    }
  }

  const whereClause = clauses.join(' AND ')

  const rows = (await rawSql`
    SELECT
      p.id, p.source_id, p.variant_id, p.sku, p.name, p.tagline,
      p.price, p.currency, p.stock, p.image, p.images, p.customized_image,
      p.description, p.details, p.is_featured, p.dominant_color,
      p.kind, p.tags, p.min_quantity,
      p.created_at, p.updated_at,
      c.name AS category_name, c.slug AS category_slug
    FROM products p
    INNER JOIN categories c ON c.id = p.category_id
    WHERE ${rawSql.unsafe(whereClause)}
    ORDER BY p.embedding <=> ${vectorStr}::vector ASC
    LIMIT ${limit}
  `) as RawProductRow[]

  return rows.map((r) => toProductWithCategory(rawRowToProductRow(r)))
}

// ---------------------------------------------------------------------------
// Catalog metadata (categories + price bounds) shared across list endpoints
// ---------------------------------------------------------------------------

async function getCatalogMeta(includeSupplies = false): Promise<{
  categories: string[]
  priceRange: { min: number; max: number }
}> {
  // Both feed the filter chips and the price slider, so for the shop supplies
  // are excluded here too — otherwise "Packaging" shows up as a filter that
  // matches nothing, and a €1 box drags the slider's floor down. The dashboard
  // asks for them, so it can filter its product table by them.
  const scope = includeSupplies ? undefined : notASupply
  const [allCategories, priceResult] = await Promise.all([
    db
      .select({ name: categories.name })
      .from(categories)
      .where(scope)
      .orderBy(asc(categories.name)),
    db
      .select({ min: min(products.price), max: max(products.price) })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(scope),
  ])

  return {
    categories: allCategories.map((c) => c.name),
    priceRange: {
      min: Number(priceResult[0]?.min ?? 0),
      max: Number(priceResult[0]?.max ?? 0),
    },
  }
}

// ---------------------------------------------------------------------------
// List products (hybrid search when q is present)
// ---------------------------------------------------------------------------

export async function listProducts(
  params: ListProductsParams,
): Promise<ListProductsResult> {
  const offset = (params.page - 1) * params.limit
  const meta = await getCatalogMeta(params.includeSupplies)

  // Parse the typed phrase into structured filters (price/category) and a
  // cleaned semantic query. Parsed constraints WIN over the incoming UI params
  // for the fields they specify; everything else passes through unchanged.
  let effective = params
  let interpretedQuery: InterpretedQuery | undefined

  if (params.q?.trim()) {
    const parsed = await parseSearchQuery(params.q.trim())
    if (parsed) {
      effective = {
        ...params,
        q: parsed.cleanedQuery || undefined,
        ...(parsed.minPrice !== undefined ? { minPrice: parsed.minPrice } : {}),
        ...(parsed.maxPrice !== undefined ? { maxPrice: parsed.maxPrice } : {}),
      }
      interpretedQuery = {
        original: params.q.trim(),
        cleaned: parsed.cleanedQuery,
        minPrice: parsed.minPrice,
        maxPrice: parsed.maxPrice,
      }
      console.log('[search] parsed query:', JSON.stringify(interpretedQuery))
    }
  }

  const hasQuery = Boolean(effective.q?.trim())

  let data: ProductWithCategory[]
  let total: number

  if (hasQuery) {
    const [semanticResults, keywordResults, [countRow]] = await Promise.all([
      semanticSearch(effective.q!, effective).catch((err) => {
        console.warn('[search] semantic search failed, falling back to keyword:', err.message)
        return [] as ProductWithCategory[]
      }),
      db
        .select(productSelect)
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(buildAllFilters(effective))
        .orderBy(desc(products.isFeatured), asc(products.name))
        .limit(effective.limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(buildAllFilters(effective)),
    ])

    const seenIds = new Set(semanticResults.map((p) => p.id))
    const keywordOnly = keywordResults
      .map(toProductWithCategory)
      .filter((p) => !seenIds.has(p.id))

    const merged = [...semanticResults, ...keywordOnly]
    data = merged.slice(0, effective.limit)

    const keywordTotal = countRow?.total ?? 0
    total = Math.max(keywordTotal, merged.length)
  } else {
    // No text to match (e.g. query was only "under 5€"): plain filtered list,
    // still honoring any price/category constraints parsed from the phrase.
    const where = buildAllFilters(effective)

    const [rows, [countRow]] = await Promise.all([
      db
        .select(productSelect)
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(where)
        .orderBy(...buildListOrder(effective.brandColor, effective.pinFeatured))
        .limit(effective.limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(where),
    ])

    data = rows.map(toProductWithCategory)
    total = countRow?.total ?? 0
  }

  const totalPages = total === 0 ? 0 : Math.ceil(total / effective.limit)
  data = await withCustomizations(data, params.companyId)

  return {
    data,
    categories: meta.categories,
    priceRange: meta.priceRange,
    interpretedQuery,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNextPage: params.page < totalPages,
      hasPrevPage: params.page > 1,
    },
  }
}

// ---------------------------------------------------------------------------
// Image search — caption the uploaded image, then run vector similarity
// against the same text-embedding column used for semantic text search.
// ---------------------------------------------------------------------------

export interface ImageSearchParams {
  imageBase64: string
  mimeType: string
  category?: string
  minPrice?: number
  maxPrice?: number
  companyId?: string
  limit?: number
}

export interface ImageSearchResult extends ListProductsResult {
  caption: string
}

export async function searchByImage(
  params: ImageSearchParams,
): Promise<ImageSearchResult> {
  const limit = params.limit ?? SEMANTIC_LIMIT
  const caption = await captionImageForSearch(params.imageBase64, params.mimeType)

  const filterParams: ListProductsParams = {
    page: 1,
    limit,
    category: params.category,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    companyId: params.companyId,
  }

  const [matches, meta] = await Promise.all([
    semanticSearch(caption, filterParams, limit),
    getCatalogMeta(),
  ])

  const data = await withCustomizations(matches, params.companyId)
  const total = data.length

  return {
    caption,
    data,
    categories: meta.categories,
    priceRange: meta.priceRange,
    pagination: {
      page: 1,
      limit,
      total,
      totalPages: total === 0 ? 0 : 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  }
}

// ---------------------------------------------------------------------------
// Bundles (pre-configured boxes and their contents)
// ---------------------------------------------------------------------------

/**
 * The parts lists for several bundles at once.
 *
 * One query for the rows and one overlay pass for the company's branded images,
 * so opening a collection page with three boxes on it costs the same as opening
 * one. Bundles with no components come back absent rather than empty — the
 * caller decides whether that is a data problem or simply not a bundle.
 */
export async function getBundleComponents(
  bundleIds: string[],
  companyId?: string,
): Promise<Map<string, BundleComponent[]>> {
  const result = new Map<string, BundleComponent[]>()
  if (bundleIds.length === 0) return result

  const rows = await db
    .select({
      bundleId: productComponents.bundleId,
      quantity: productComponents.quantity,
      role: productComponents.role,
      sortOrder: productComponents.sortOrder,
      product: productSelect,
    })
    .from(productComponents)
    .innerJoin(products, eq(productComponents.componentId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(inArray(productComponents.bundleId, bundleIds))
    .orderBy(asc(productComponents.sortOrder), asc(products.name))

  if (rows.length === 0) return result

  // Brand the component pictures the same way the catalogue would, so a box
  // opened by a logged-in company shows their mugs, not the plain ones.
  const branded = await withCustomizations(
    rows.map((r) => toProductWithCategory(r.product)),
    companyId,
  )

  rows.forEach((row, i) => {
    const list = result.get(row.bundleId) ?? []
    list.push({
      product: branded[i],
      quantity: row.quantity,
      role: row.role,
      sortOrder: row.sortOrder,
    })
    result.set(row.bundleId, list)
  })
  return result
}

/**
 * Attach parts lists to whichever of these products are bundles.
 *
 * Only single-product and by-id reads call this. The catalogue list does not:
 * a grid of cards shows a price and a picture, and loading every box's contents
 * to render them would be a second query for nothing.
 */
async function withComponents(
  data: ProductWithCategory[],
  companyId?: string,
): Promise<ProductWithCategory[]> {
  const bundleIds = data.filter((p) => p.kind === 'bundle').map((p) => p.id)
  if (bundleIds.length === 0) return data

  const components = await getBundleComponents(bundleIds, companyId)
  return data.map((product) =>
    product.kind === 'bundle'
      ? { ...product, components: components.get(product.id) ?? [] }
      : product,
  )
}

/** One bundle with everything in it, or null when the id is not a bundle. */
export async function getBundleWithComponents(
  id: string,
  companyId?: string,
): Promise<ProductWithCategory | null> {
  const product = await getProductById(id, companyId)
  if (!product || product.kind !== 'bundle') return null
  return product
}

// ---------------------------------------------------------------------------
// Get single product
// ---------------------------------------------------------------------------

export async function getProductById(
  id: string,
  companyId?: string,
): Promise<ProductWithCategory | null> {
  const rows = await db
    .select(productSelect)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1)

  if (rows.length === 0) return null

  const branded = await withCustomizations(
    [toProductWithCategory(rows[0])],
    companyId,
  )
  const [product] = await withComponents(branded, companyId)
  return product
}

/**
 * Every supply, grouped by the caller into its box / filling pickers. This is
 * the only read that deliberately returns `isSupply` rows — the box builder
 * needs them to price and assemble a box.
 */
export async function listSupplies(
  companyId?: string,
): Promise<ProductWithCategory[]> {
  const rows = await db
    .select(productSelect)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(inArray(categories.slug, SUPPLY_CATEGORY_SLUGS))
    .orderBy(asc(categories.slug), asc(products.price), asc(products.name))

  return withCustomizations(rows.map(toProductWithCategory), companyId)
}

/**
 * Fetch several products at once, with the caller's company image overlay
 * applied. Used to refresh client-side snapshots (the cart) against live data,
 * so a branded image generated after the item was added still shows up.
 * Ids that no longer exist are simply absent from the result.
 */
export async function getProductsByIds(
  ids: string[],
  companyId?: string,
): Promise<ProductWithCategory[]> {
  if (ids.length === 0) return []

  const rows = await db
    .select(productSelect)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(inArray(products.id, ids))

  const branded = await withCustomizations(
    rows.map(toProductWithCategory),
    companyId,
  )
  // The cart hydrates through here, and a cart line can be a bundle.
  return withComponents(branded, companyId)
}

// ---------------------------------------------------------------------------
// Related products (vector similarity)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CRUD (dashboard product management)
// ---------------------------------------------------------------------------

import {
  composedImage,
  composeLayout,
  describePlacement,
  fetchLayoutAssets,
  placedTextLayers,
  placedTypefaces,
  placementInventory,
} from '../../customizer/composeLayout.js'
import type { FetchedImage } from '../../customizer/fetchImage.js'
import { fetchImage } from '../../customizer/fetchImage.js'
import {
  missingImageLlmConfigMessage,
  resolveImageLlmConfig,
} from '../../customizer/llmImageConfig.js'
import { hasPlacement } from '../../customizer/placementLayout.js'
import { resolveBrandingImage } from '../../customizer/resolveBranding.js'
import {
  fetchedImageFromDataUrl,
  generateProductPhoto,
} from '../../photoshoot/generate.js'
import { buildBoxPrintPrompt } from '../../systemInstruction/boxCustomization.js'
import {
  buildPhotoshootPrompt,
  isValidSceneType,
  KEEP_SCENE_ID,
  resolveAspectRatio,
} from '../../systemInstruction/productPhotoshoot.js'
import { saveRenderedImage } from '../uploads/uploads.service.js'
import type {
  CreateProductBody,
  CustomizeBoxBody,
  CustomizeProductBody,
  PhotoshootBody,
  UpdateProductBody,
} from './products.schema.js'

// ---------------------------------------------------------------------------
// AI photoshoot — generate a styled product image from the 3-image system
// ---------------------------------------------------------------------------

export interface ProductPhotoshootResult {
  url: string
  prompt: string
}

export async function runProductPhotoshoot(
  productId: string,
  params: PhotoshootBody,
): Promise<ProductPhotoshootResult> {
  const product = await getProductById(productId)
  if (!product) {
    throw new Error('Product not found')
  }

  const config = resolveImageLlmConfig()
  if (!config) {
    throw new Error(missingImageLlmConfigMessage())
  }

  const sceneType = isValidSceneType(params.sceneType)
    ? params.sceneType
    : 'studio-hero'
  const ratio = resolveAspectRatio(params.aspectRatio)

  // `images.edit` treats the FIRST image as the edit base. Precedence:
  //   hand-placed layout > refine (previous result) > style image > product.
  const productImage = await fetchImage(params.productImageUrl, 'product')

  // Branding — defaults to the company logo. Accept an uploaded data URL,
  // a remote logo URL, or inline SVG markup (whichever the client provides).
  const brandingImage = await resolveBrandingImage(params)
  const hasBranding = Boolean(brandingImage)

  // A hand-placed layout outranks both a refine base and a style image: all
  // three want to be the edit base, and re-applying moved branding on top of a
  // render that already carries it produces two copies.
  const layout = params.layout
  const hasLayout = hasPlacement(layout)
  const layoutImage = hasLayout
    ? composedImage(
        await composeLayout(
          productImage,
          layout,
          brandingImage,
          await fetchLayoutAssets(layout),
        ),
      )
    : undefined

  // When the layout places the logo, the composite already carries it, at the
  // size and position the customer set. Attaching the logo a second time hands
  // the model a loose mark plus a strong prior to put one on the product, and
  // it obliges: a duplicate copy elsewhere on the same item. The prompt can ask
  // it not to and still lose. Not attaching it is what settles the matter —
  // the same conclusion the bundle render reached in composition mode.
  const layoutPlacesLogo =
    hasLayout && layout.layers.some((l) => l.kind === 'logo')

  const hasBase = !hasLayout && Boolean(params.baseImageUrl)
  const baseImage =
    hasBase && params.baseImageUrl
      ? await fetchImage(params.baseImageUrl, 'product')
      : undefined

  // Style only applies to fresh generations, not when refining a prior result.
  const hasStyle = !hasBase && !hasLayout && Boolean(params.styleImage)
  const styleImage =
    hasStyle && params.styleImage
      ? await fetchedImageFromDataUrl(params.styleImage, 'product')
      : undefined

  // Edit base goes first: layout mockup → refine target → style scene →
  // product. Then the product reference (kept when not already the base) and
  // branding. The logo rides along even though the composite already contains
  // it — that copy is downscaled and rough, and the model needs a clean source
  // for the artwork itself.
  const images: FetchedImage[] = []
  if (layoutImage) {
    images.push(layoutImage, productImage)
  } else if (baseImage) {
    images.push(baseImage, productImage)
  } else if (styleImage) {
    images.push(styleImage, productImage)
  } else {
    images.push(productImage)
  }
  if (brandingImage && !hasLayout) images.push(brandingImage)

  const prompt = buildPhotoshootPrompt({
    sceneType,
    aspectRatio: ratio.id,
    productName: product.name,
    hasStyle,
    hasBranding: hasBranding && !hasLayout,
    hasBase,
    extra: params.prompt,
    hasLayout,
    placement: hasLayout ? describePlacement(layout) : undefined,
    placedText: hasLayout ? placedTextLayers(layout) : undefined,
    placedFonts: hasLayout ? placedTypefaces(layout) : undefined,
    inventory: hasLayout ? placementInventory(layout) : undefined,
    logoPlaced: layoutPlacesLogo,
  })

  // Always honour the chosen aspect ratio — it defines a single, well-framed
  // canvas (this is also what stops the model laying out a grid of variations).
  const buffer = await generateProductPhoto(prompt, images, config, {
    size: ratio.openaiSize,
    aspectRatio: ratio.geminiRatio,
  })
  const url = await saveRenderedImage(buffer.toString('base64'))

  return { url, prompt }
}

// ---------------------------------------------------------------------------
// Box customization — print a design onto a packaging supply
// ---------------------------------------------------------------------------

export interface CustomizeBoxResult {
  url: string
  prompt: string
}

/**
 * Render the chosen gift box with a design printed on it. Same generation
 * pipeline as the product photoshoot, but a different brief: the box is the
 * thing being changed rather than the thing being preserved, and its own
 * catalogue copy (dimensions, material, printable surfaces) is fed in as fact.
 */
export async function customizeBox(
  productId: string,
  params: CustomizeBoxBody,
): Promise<CustomizeBoxResult> {
  const product = await getProductById(productId)
  if (!product) throw new Error('Product not found')
  if (product.categorySlug !== PACKAGING_SLUG) {
    throw new Error('Only packaging can be customized')
  }

  const config = resolveImageLlmConfig()
  if (!config) throw new Error(missingImageLlmConfigMessage())

  // The box is the edit base — unless we're iterating, where the previous
  // render is, so successive tweaks build on each other.
  const boxImage = await fetchImage(
    params.boxImageUrl ?? product.image,
    'product',
  )
  // The shopper asked for their logo — rendering without it would silently
  // produce an unbranded (or model-invented) box, so a failed fetch fails the
  // request instead.
  const brandingImage = await resolveBrandingImage(params, { required: true })

  // A hand-placed layout takes the edit-base slot from a refine base. Both want
  // to be the first attachment, and applying a moved logo on top of a render
  // that already carries it is how you end up with two.
  const layout = params.layout
  const hasLayout = hasPlacement(layout)
  const layoutImage = hasLayout
    ? composedImage(
        await composeLayout(
          boxImage,
          layout,
          brandingImage,
          await fetchLayoutAssets(layout),
        ),
      )
    : undefined

  // When the layout places the logo, the composite already carries it, at the
  // size and position the customer set. Attaching the logo a second time hands
  // the model a loose mark plus a strong prior to put one on the product, and
  // it obliges: a duplicate copy elsewhere on the same item. The prompt can ask
  // it not to and still lose. Not attaching it is what settles the matter —
  // the same conclusion the bundle render reached in composition mode.
  const layoutPlacesLogo =
    hasLayout && layout.layers.some((l) => l.kind === 'logo')

  const baseImage =
    !hasLayout && params.baseImageUrl
      ? await fetchImage(params.baseImageUrl, 'product')
      : undefined

  // The plain box photo stays attached in every multi-image case — it is the
  // ground truth for construction, proportions and stock colour that neither a
  // composite nor a prior render can be trusted for.
  const images: FetchedImage[] = layoutImage
    ? [layoutImage, boxImage]
    : baseImage
      ? [baseImage, boxImage]
      : [boxImage]
  if (brandingImage && !hasLayout) images.push(brandingImage)

  const prompt = buildBoxPrintPrompt({
    boxName: product.name,
    boxDescription: product.description,
    boxDetails: product.details,
    color: params.color,
    request: params.prompt,
    hasBranding: Boolean(brandingImage) && !hasLayout,
    hasBase: Boolean(baseImage),
    hasLayout,
    placement: hasLayout ? describePlacement(layout) : undefined,
    placedText: hasLayout ? placedTextLayers(layout) : undefined,
    placedFonts: hasLayout ? placedTypefaces(layout) : undefined,
    inventory: hasLayout ? placementInventory(layout) : undefined,
    logoPlaced: layoutPlacesLogo,
  })

  const buffer = await generateProductPhoto(prompt, images, config, {
    size: '1024x1024',
    aspectRatio: '1:1',
  })
  const url = await saveRenderedImage(buffer.toString('base64'))

  return { url, prompt }
}

// ---------------------------------------------------------------------------
// Customizing any product — what the design editor calls
// ---------------------------------------------------------------------------

/**
 * Apply a design to whatever the user opened in the editor.
 *
 * A gift box and a notebook are the same gesture to the user — drag the logo
 * on, render it — but two different jobs for the model. A box is *printed*: its
 * construction is fixed, its board has a stock colour, and the supplier only
 * prints certain faces. A notebook is *photographed*: it gets branded and then
 * staged in a scene at a chosen aspect ratio.
 *
 * So this dispatches on the category rather than trying to merge the two
 * briefs, and delegates to the two paths that already exist. Keeping the
 * dispatch here rather than in the client means the browser never has to know
 * which prompt system a product belongs to.
 */
export async function customizeProduct(
  productId: string,
  params: CustomizeProductBody,
): Promise<CustomizeBoxResult> {
  const product = await getProductById(productId)
  if (!product) throw new Error('Product not found')
  // A bundle is a price and a parts list, not a thing with a surface. Its
  // contents are designed one at a time in the builder.
  if (product.kind === 'bundle') {
    throw new Error('A pre-configured box is designed through its contents')
  }

  const branding = {
    brandingImage: params.brandingImage,
    brandingImageUrl: params.brandingImageUrl,
    brandingSvg: params.brandingSvg,
  }

  if (product.categorySlug === PACKAGING_SLUG) {
    return customizeBox(productId, {
      prompt: params.prompt,
      color: params.color,
      baseImageUrl: params.baseImageUrl,
      boxImageUrl: params.productImageUrl,
      layout: params.layout,
      ...branding,
    })
  }

  return runProductPhotoshoot(productId, {
    // Branding a product is not the same as photographing one. Left to itself
    // the editor should change exactly what the user changed — the mark on the
    // item — and leave the picture alone. A scene is opt-in.
    sceneType: params.sceneType ?? KEEP_SCENE_ID,
    aspectRatio: params.aspectRatio ?? 'square',
    productImageUrl: params.productImageUrl ?? product.image,
    prompt: params.prompt || undefined,
    baseImageUrl: params.baseImageUrl,
    layout: params.layout,
    ...branding,
  })
}

/** Build the text we embed for semantic search from a product's key fields. */
function embeddingText(p: {
  name: string
  tagline?: string | null
  description?: string | null
}): string {
  return [p.name, p.tagline, p.description].filter(Boolean).join('. ')
}

/** Best-effort embedding — never block a write if the embedding service fails. */
async function tryEmbed(text: string): Promise<number[] | null> {
  try {
    return await embedText(text)
  } catch (err) {
    console.warn(
      '[products] embedding failed, saving without it:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

export async function createProduct(
  input: CreateProductBody,
): Promise<ProductWithCategory> {
  const sku =
    input.sku?.trim() ||
    `MANUAL-${input.name.replace(/[^a-zA-Z0-9]+/g, '-').toUpperCase().slice(0, 12)}-${Date.now()}`

  const embedding = await tryEmbed(embeddingText(input))

  // Gallery is the source of truth for ordering; `image` mirrors the first
  // entry so existing single-image consumers (cards, search) keep working.
  const gallery =
    input.images && input.images.length > 0 ? input.images : [input.image]
  const cover = gallery[0]

  const [inserted] = await db
    .insert(products)
    .values({
      sourceId: input.sourceId ?? 'manual',
      variantId: input.variantId ?? null,
      sku,
      name: input.name,
      tagline: input.tagline ?? '',
      price: String(input.price),
      currency: input.currency ?? 'EUR',
      stock: input.stock ?? 0,
      categoryId: input.categoryId,
      image: cover,
      images: gallery,
      description: input.description ?? '',
      details: input.details ?? [],
      isFeatured: input.isFeatured ?? false,
      kind: input.kind ?? 'single',
      tags: normalizeTags(input.tags),
      minQuantity: input.minQuantity ?? 1,
      ...(embedding
        ? { embedding, embeddingUpdatedAt: new Date() }
        : {}),
    })
    .returning({ id: products.id })

  if (input.components) {
    await replaceComponents(inserted.id, input.components)
  }

  const created = await getProductById(inserted.id)
  if (!created) throw new Error('Failed to load created product')
  return created
}

/** Lowercased, de-duplicated, blank-free. Tags are matched exactly. */
function normalizeTags(tags?: string[]): string[] {
  if (!tags) return []
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

/**
 * Replace a bundle's parts list wholesale.
 *
 * Delete-then-insert rather than a diff: the editor sends the list it wants,
 * and matching rows up to preserve ids buys nothing since nothing references
 * them. The Neon HTTP driver has no interactive transactions, so the two
 * statements go as one batch — they either both land or neither does.
 */
async function replaceComponents(
  bundleId: string,
  components: NonNullable<CreateProductBody['components']>,
): Promise<void> {
  const rows = components.map((c, i) => ({
    bundleId,
    componentId: c.componentId,
    quantity: c.quantity ?? 1,
    role: c.role ?? ('item' as const),
    sortOrder: c.sortOrder ?? i,
  }))

  const remove = db
    .delete(productComponents)
    .where(eq(productComponents.bundleId, bundleId))

  if (rows.length === 0) {
    await remove
    return
  }
  await db.batch([remove, db.insert(productComponents).values(rows)])
}

/**
 * Patch a catalog product.
 *
 * `companyId` is the editor's company, and it matters for the gallery: a saved
 * `images` list is authoritative, so this also prunes that company's own
 * `company_product_images` rows for entries the list drops — otherwise the read
 * overlay would union them straight back in on the next fetch. It is also what
 * the returned row is scoped to, so the response shows the same gallery the
 * next GET will.
 */
export async function updateProduct(
  id: string,
  input: UpdateProductBody,
  companyId?: string,
): Promise<ProductWithCategory | null> {
  const existing = await db
    .select({
      id: products.id,
      name: products.name,
      tagline: products.tagline,
      description: products.description,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1)

  if (existing.length === 0) return null

  // Re-embed only when a field that feeds the embedding changed.
  const touchesEmbedding =
    input.name !== undefined ||
    input.tagline !== undefined ||
    input.description !== undefined

  const values: Record<string, unknown> = {}
  if (input.name !== undefined) values.name = input.name
  if (input.tagline !== undefined) values.tagline = input.tagline
  if (input.price !== undefined) values.price = String(input.price)
  if (input.currency !== undefined) values.currency = input.currency
  if (input.stock !== undefined) values.stock = input.stock
  if (input.categoryId !== undefined) values.categoryId = input.categoryId
  // When the gallery changes, persist it and re-sync the cover to images[0].
  if (input.images !== undefined && input.images.length > 0) {
    values.images = input.images
    values.image = input.images[0]
  } else if (input.image !== undefined) {
    values.image = input.image
  }
  if (input.description !== undefined) values.description = input.description
  if (input.details !== undefined) values.details = input.details
  if (input.isFeatured !== undefined) values.isFeatured = input.isFeatured
  if (input.sku !== undefined) values.sku = input.sku
  if (input.variantId !== undefined) values.variantId = input.variantId
  if (input.kind !== undefined) values.kind = input.kind
  if (input.tags !== undefined) values.tags = normalizeTags(input.tags)
  if (input.minQuantity !== undefined) values.minQuantity = input.minQuantity

  if (touchesEmbedding) {
    const merged = {
      name: input.name ?? existing[0].name,
      tagline: input.tagline ?? existing[0].tagline,
      description: input.description ?? existing[0].description,
    }
    const embedding = await tryEmbed(embeddingText(merged))
    if (embedding) {
      values.embedding = embedding
      values.embeddingUpdatedAt = new Date()
    }
  }

  if (Object.keys(values).length > 0) {
    await db.update(products).set(values).where(eq(products.id, id))
  }

  if (input.components !== undefined) {
    await replaceComponents(id, input.components)
  }

  if (companyId && input.images !== undefined && input.images.length > 0) {
    await pruneCompanyProductImages({
      companyId,
      productId: id,
      keepUrls: input.images,
    })
  }

  return getProductById(id, companyId)
}

export async function deleteProduct(id: string): Promise<boolean> {
  const deleted = await db
    .delete(products)
    .where(eq(products.id, id))
    .returning({ id: products.id })

  return deleted.length > 0
}

export async function getRelatedProducts(
  productId: string,
  limit = 4,
  companyId?: string,
  /**
   * Only products carrying this tag. A product opened from a landing page
   * suggests more of that page, not the rest of the catalogue.
   */
  tag?: string,
): Promise<ProductWithCategory[]> {
  const tagged = tag ? JSON.stringify([tag.toLowerCase()]) : null
  const rows = (await rawSql`
    SELECT
      p.id, p.source_id, p.variant_id, p.sku, p.name, p.tagline,
      p.price, p.currency, p.stock, p.image, p.images, p.customized_image,
      p.description, p.details, p.is_featured, p.dominant_color,
      p.kind, p.tags, p.min_quantity,
      p.created_at, p.updated_at,
      c.name AS category_name, c.slug AS category_slug
    FROM products p
    INNER JOIN categories c ON c.id = p.category_id
    CROSS JOIN (
      SELECT embedding FROM products WHERE id = ${productId}::uuid
    ) ref
    WHERE p.id != ${productId}::uuid
      AND ${rawSql.unsafe(NOT_SUPPLY_SQL)}
      AND p.embedding IS NOT NULL
      AND ref.embedding IS NOT NULL
      AND (${tagged}::jsonb IS NULL OR p.tags @> ${tagged}::jsonb)
    ORDER BY p.embedding <=> ref.embedding ASC
    LIMIT ${limit}
  `) as RawProductRow[]

  const data = rows.map((r) => toProductWithCategory(rawRowToProductRow(r)))
  return withCustomizations(data, companyId)
}
