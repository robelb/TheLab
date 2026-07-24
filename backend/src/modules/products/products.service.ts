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
  sql,
} from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db, rawSql } from '../../db/index.js'
import {
  brandCustomizations,
  categories,
  companyProductImages,
  products,
} from '../../db/schema/index.js'
import { hexToLab } from '../../lib/color.js'
import { normalizePublicImageUrl } from '../../lib/publicImageUrl.js'
import { embedText } from '../../services/embedding.js'
import { captionImageForSearch } from '../../services/imageCaption.js'
import { parseSearchQuery } from '../../services/queryParser.js'
import type {
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
  images: products.images,
  customizedImage: products.customizedImage,
  description: products.description,
  details: products.details,
  isFeatured: products.isFeatured,
  dominantColor: products.dominantColor,
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
 */
function buildListOrder(brandColor?: string): SQL[] {
  const lab = brandColor ? hexToLab(brandColor) : null
  if (!lab) return [desc(products.isFeatured), asc(products.name)]

  const distance = sql`(
    power(${products.colorL} - ${lab.l}, 2) +
    power(${products.colorA} - ${lab.a}, 2) +
    power(${products.colorB} - ${lab.b}, 2)
  ) asc nulls last`
  return [desc(products.isFeatured), distance, asc(products.name)]
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
): Promise<ProductWithCategory[]> {
  return semanticSearch(query, { page: 1, limit, companyId: undefined }, limit)
}

async function semanticSearch(
  query: string,
  params: ListProductsParams,
  limit: number = SEMANTIC_LIMIT,
): Promise<ProductWithCategory[]> {
  const vectorStr = `[${(await embedText(query)).join(',')}]`

  const clauses: string[] = ['p.embedding IS NOT NULL']

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

  const whereClause = clauses.join(' AND ')

  const rows = (await rawSql`
    SELECT
      p.id, p.source_id, p.variant_id, p.sku, p.name, p.tagline,
      p.price, p.currency, p.stock, p.image, p.images, p.customized_image,
      p.description, p.details, p.is_featured, p.dominant_color,
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
  const meta = await getCatalogMeta()

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
        .orderBy(...buildListOrder(effective.brandColor))
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

  const [product] = await withCustomizations(
    [toProductWithCategory(rows[0])],
    companyId,
  )
  return product
}

// ---------------------------------------------------------------------------
// Related products (vector similarity)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CRUD (dashboard product management)
// ---------------------------------------------------------------------------

import type { FetchedImage } from '../../customizer/fetchImage.js'
import { fetchImage, fetchImageOptional } from '../../customizer/fetchImage.js'
import {
  missingImageLlmConfigMessage,
  resolveImageLlmConfig,
} from '../../customizer/llmImageConfig.js'
import { fetchedImageFromInlineSvg } from '../../customizer/normalizeImageForAi.js'
import {
  fetchedImageFromDataUrl,
  generateProductPhoto,
} from '../../photoshoot/generate.js'
import {
  buildPhotoshootPrompt,
  isValidSceneType,
  resolveAspectRatio,
} from '../../systemInstruction/productPhotoshoot.js'
import { saveImage } from '../uploads/uploads.service.js'
import type { CreateProductBody, PhotoshootBody, UpdateProductBody } from './products.schema.js'

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
  //   refine (previous result) > style image > the product itself.
  const productImage = await fetchImage(params.productImageUrl, 'product')

  const hasBase = Boolean(params.baseImageUrl)
  const baseImage = params.baseImageUrl
    ? await fetchImage(params.baseImageUrl, 'product')
    : undefined

  // Style only applies to fresh generations, not when refining a prior result.
  const hasStyle = !hasBase && Boolean(params.styleImage)
  const styleImage =
    hasStyle && params.styleImage
      ? await fetchedImageFromDataUrl(params.styleImage, 'product')
      : undefined

  // Branding — defaults to the company logo. Accept an uploaded data URL,
  // a remote logo URL, or inline SVG markup (whichever the client provides).
  let brandingImage: FetchedImage | undefined
  if (params.brandingImage) {
    brandingImage = await fetchedImageFromDataUrl(params.brandingImage, 'logo')
  } else if (params.brandingImageUrl) {
    brandingImage =
      (await fetchImageOptional(params.brandingImageUrl, 'logo')) ?? undefined
  } else if (params.brandingSvg) {
    brandingImage = await fetchedImageFromInlineSvg(params.brandingSvg)
  }
  const hasBranding = Boolean(brandingImage)

  // Order is the edit base first: style (scene) → product → branding when a
  // Edit base goes first: refine target → style scene → product. Then product
  // reference (kept when not already the base) and branding.
  const images: FetchedImage[] = []
  if (baseImage) {
    images.push(baseImage, productImage)
  } else if (styleImage) {
    images.push(styleImage, productImage)
  } else {
    images.push(productImage)
  }
  if (brandingImage) images.push(brandingImage)

  const prompt = buildPhotoshootPrompt({
    sceneType,
    aspectRatio: ratio.id,
    productName: product.name,
    hasStyle,
    hasBranding,
    hasBase,
    extra: params.prompt,
  })

  // Always honour the chosen aspect ratio — it defines a single, well-framed
  // canvas (this is also what stops the model laying out a grid of variations).
  const buffer = await generateProductPhoto(prompt, images, config, {
    size: ratio.openaiSize,
  })
  const url = await saveImage(buffer.toString('base64'))

  return { url, prompt }
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
      ...(embedding
        ? { embedding, embeddingUpdatedAt: new Date() }
        : {}),
    })
    .returning({ id: products.id })

  const created = await getProductById(inserted.id)
  if (!created) throw new Error('Failed to load created product')
  return created
}

export async function updateProduct(
  id: string,
  input: UpdateProductBody,
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

  await db.update(products).set(values).where(eq(products.id, id))

  return getProductById(id)
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
): Promise<ProductWithCategory[]> {
  const rows = (await rawSql`
    SELECT
      p.id, p.source_id, p.variant_id, p.sku, p.name, p.tagline,
      p.price, p.currency, p.stock, p.image, p.images, p.customized_image,
      p.description, p.details, p.is_featured, p.dominant_color,
      p.created_at, p.updated_at,
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
  return withCustomizations(data, companyId)
}
