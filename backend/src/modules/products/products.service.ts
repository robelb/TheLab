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
  images: products.images,
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

/**
 * Public, brand-agnostic semantic search over the product vector column.
 * Used by campaign assembly to pick a bundle from a free-text brand query.
 * Customization overlay is applied later (domain-aware) during hydration.
 */
export async function searchProductsByText(
  query: string,
  limit = 6,
): Promise<ProductWithCategory[]> {
  return semanticSearch(query, { page: 1, limit, domain: undefined }, limit)
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
  domain?: string,
): Promise<ProductWithCategory[]> {
  const rows = (await rawSql`
    SELECT
      p.id, p.source_id, p.variant_id, p.sku, p.name, p.tagline,
      p.price, p.currency, p.stock, p.image, p.images, p.customized_image,
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
