import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  max,
  min,
  or,
} from 'drizzle-orm'
import { db, rawSql } from '../../db/index.js'
import { brandCustomizations, categories, products } from '../../db/schema/index.js'
import { embedText } from '../../services/embedding.js'
import { captionImageForSearch } from '../../services/imageCaption.js'
import type {
  ListProductsParams,
  ListProductsResult,
  ProductWithCategory,
  RawProductRow,
} from '../../types/product.js'
import {
  rawRowToProductRow,
  toProductWithCategory,
} from '../../types/product.js'

export type { ListProductsParams, ListProductsResult, ProductWithCategory }

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
  customizedImage: products.customizedImage,
  description: products.description,
  details: products.details,
  isFeatured: products.isFeatured,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
  categoryName: categories.name,
  categorySlug: categories.slug,
} as const

// ---------------------------------------------------------------------------
// Filter builders
// ---------------------------------------------------------------------------

function buildNonTextFilters(params: ListProductsParams) {
  const conditions = []

  if (params.category) {
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

// ---------------------------------------------------------------------------
// Customization overlay (per-domain branded images)
// ---------------------------------------------------------------------------

async function getCustomizationMap(
  domain: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      productId: brandCustomizations.productId,
      imageUrl: brandCustomizations.imageUrl,
    })
    .from(brandCustomizations)
    .where(eq(brandCustomizations.domain, domain))

  return new Map(rows.map((r) => [r.productId, r.imageUrl]))
}

function applyCustomizations(
  items: ProductWithCategory[],
  customizations: Map<string, string>,
): ProductWithCategory[] {
  if (customizations.size === 0) return items
  return items.map((p) => {
    const url = customizations.get(p.id)
    return url ? { ...p, customizedImage: url } : p
  })
}

async function withCustomizations(
  data: ProductWithCategory[],
  domain?: string,
): Promise<ProductWithCategory[]> {
  if (!domain) return data
  return applyCustomizations(data, await getCustomizationMap(domain))
}

// ---------------------------------------------------------------------------
// Semantic search (vector similarity via pgvector)
// ---------------------------------------------------------------------------

const SEMANTIC_LIMIT = 10

async function semanticSearch(
  query: string,
  params: ListProductsParams,
  limit: number = SEMANTIC_LIMIT,
): Promise<ProductWithCategory[]> {
  const vectorStr = `[${(await embedText(query)).join(',')}]`

  const clauses: string[] = ['p.embedding IS NOT NULL']

  if (params.category) {
    const safe = params.category.toLowerCase().replace(/'/g, "''")
    clauses.push(`(c.slug = '${safe}' OR LOWER(c.name) = '${safe}')`)
  }
  if (params.minPrice !== undefined) {
    clauses.push(`p.price >= ${Number(params.minPrice)}`)
  }
  if (params.maxPrice !== undefined) {
    clauses.push(`p.price <= ${Number(params.maxPrice)}`)
  }

  const whereClause = clauses.join(' AND ')

  const rows = (await rawSql`
    SELECT
      p.id, p.source_id, p.variant_id, p.sku, p.name, p.tagline,
      p.price, p.currency, p.stock, p.image, p.customized_image,
      p.description, p.details, p.is_featured, p.created_at, p.updated_at,
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

async function getCatalogMeta(): Promise<{
  categories: string[]
  priceRange: { min: number; max: number }
}> {
  const [allCategories, priceResult] = await Promise.all([
    db
      .select({ name: categories.name })
      .from(categories)
      .orderBy(asc(categories.name)),
    db
      .select({ min: min(products.price), max: max(products.price) })
      .from(products),
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
  const hasQuery = Boolean(params.q?.trim())

  const meta = await getCatalogMeta()

  let data: ProductWithCategory[]
  let total: number

  if (hasQuery) {
    const [semanticResults, keywordResults, [countRow]] = await Promise.all([
      semanticSearch(params.q!, params).catch((err) => {
        console.warn('[search] semantic search failed, falling back to keyword:', err.message)
        return [] as ProductWithCategory[]
      }),
      db
        .select(productSelect)
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(buildAllFilters(params))
        .orderBy(desc(products.isFeatured), asc(products.name))
        .limit(params.limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(buildAllFilters(params)),
    ])

    const seenIds = new Set(semanticResults.map((p) => p.id))
    const keywordOnly = keywordResults
      .map(toProductWithCategory)
      .filter((p) => !seenIds.has(p.id))

    const merged = [...semanticResults, ...keywordOnly]
    data = merged.slice(0, params.limit)

    const keywordTotal = countRow?.total ?? 0
    total = Math.max(keywordTotal, merged.length)
  } else {
    const where = buildAllFilters(params)

    const [rows, [countRow]] = await Promise.all([
      db
        .select(productSelect)
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(where)
        .orderBy(desc(products.isFeatured), asc(products.name))
        .limit(params.limit)
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

  const totalPages = total === 0 ? 0 : Math.ceil(total / params.limit)
  data = await withCustomizations(data, params.domain)

  return {
    data,
    categories: meta.categories,
    priceRange: meta.priceRange,
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
  domain?: string
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
    domain: params.domain,
  }

  const [matches, meta] = await Promise.all([
    semanticSearch(caption, filterParams, limit),
    getCatalogMeta(),
  ])

  const data = await withCustomizations(matches, params.domain)
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
// Get single product
// ---------------------------------------------------------------------------

export async function getProductById(
  id: string,
  domain?: string,
): Promise<ProductWithCategory | null> {
  const rows = await db
    .select(productSelect)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1)

  if (rows.length === 0) return null

  const [product] = await withCustomizations(
    [toProductWithCategory(rows[0])],
    domain,
  )
  return product
}

// ---------------------------------------------------------------------------
// Related products (vector similarity)
// ---------------------------------------------------------------------------

export async function getRelatedProducts(
  productId: string,
  limit = 4,
  domain?: string,
): Promise<ProductWithCategory[]> {
  const rows = (await rawSql`
    SELECT
      p.id, p.source_id, p.variant_id, p.sku, p.name, p.tagline,
      p.price, p.currency, p.stock, p.image, p.customized_image,
      p.description, p.details, p.is_featured, p.created_at, p.updated_at,
      c.name AS category_name, c.slug AS category_slug
    FROM products p
    INNER JOIN categories c ON c.id = p.category_id
    CROSS JOIN (
      SELECT embedding FROM products WHERE id = ${productId}::uuid
    ) ref
    WHERE p.id != ${productId}::uuid
      AND p.embedding IS NOT NULL
      AND ref.embedding IS NOT NULL
    ORDER BY p.embedding <=> ref.embedding ASC
    LIMIT ${limit}
  `) as RawProductRow[]

  const data = rows.map((r) => toProductWithCategory(rawRowToProductRow(r)))
  return withCustomizations(data, domain)
}
