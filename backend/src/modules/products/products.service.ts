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
import { db } from '../../db/index.js'
import { brandCustomizations, categories, products } from '../../db/schema/index.js'

export interface ProductWithCategory {
  id: string
  sourceId: string
  variantId: string | null
  sku: string
  name: string
  tagline: string
  price: number
  currency: string
  stock: number
  category: string
  categorySlug: string
  image: string
  customizedImage: string | null
  description: string
  details: string[]
  isFeatured: boolean
}

interface ProductRow {
  id: string
  sourceId: string
  variantId: string | null
  sku: string
  name: string
  tagline: string
  price: string
  currency: string
  stock: number
  categoryId: string
  image: string
  customizedImage: string | null
  description: string
  details: string[] | null
  isFeatured: boolean
  createdAt: Date
  updatedAt: Date
  categoryName: string
  categorySlug: string
}

function toProductWithCategory(row: ProductRow): ProductWithCategory {
  return {
    id: row.id,
    sourceId: row.sourceId,
    variantId: row.variantId,
    sku: row.sku,
    name: row.name,
    tagline: row.tagline,
    price: Number(row.price),
    currency: row.currency,
    stock: row.stock,
    category: row.categoryName,
    categorySlug: row.categorySlug,
    image: row.image,
    customizedImage: row.customizedImage,
    description: row.description,
    details: row.details ?? [],
    isFeatured: row.isFeatured,
  }
}

export interface ListProductsParams {
  page: number
  limit: number
  category?: string
  q?: string
  minPrice?: number
  maxPrice?: number
  domain?: string
}

export interface ListProductsResult {
  data: ProductWithCategory[]
  categories: string[]
  priceRange: { min: number; max: number }
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

function buildFilters(params: ListProductsParams) {
  const conditions = []

  if (params.category) {
    const slug = params.category.toLowerCase()
    conditions.push(
      or(
        eq(categories.slug, slug),
        ilike(categories.name, slug),
      ),
    )
  }

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

  if (params.minPrice !== undefined) {
    conditions.push(gte(products.price, String(params.minPrice)))
  }

  if (params.maxPrice !== undefined) {
    conditions.push(lte(products.price, String(params.maxPrice)))
  }

  return conditions.length > 0 ? and(...conditions) : undefined
}

export async function listProducts(
  params: ListProductsParams,
): Promise<ListProductsResult> {
  const where = buildFilters(params)
  const offset = (params.page - 1) * params.limit

  const [rows, [countRow], allCategories, priceResult] = await Promise.all([
    db
      .select({
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
      })
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

    db
      .select({ name: categories.name })
      .from(categories)
      .orderBy(asc(categories.name)),

    db
      .select({
        min: min(products.price),
        max: max(products.price),
      })
      .from(products),
  ])

  const total = countRow?.total ?? 0
  const totalPages = total === 0 ? 0 : Math.ceil(total / params.limit)

  let data = rows.map(toProductWithCategory)

  if (params.domain) {
    const customizations = await getCustomizationMap(params.domain)
    data = applyCustomizations(data, customizations)
  }

  return {
    data,
    categories: allCategories.map((c) => c.name),
    priceRange: {
      min: Number(priceResult[0]?.min ?? 0),
      max: Number(priceResult[0]?.max ?? 0),
    },
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

export async function getProductById(
  id: string,
  domain?: string,
): Promise<ProductWithCategory | null> {
  const rows = await db
    .select({
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
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1)

  if (rows.length === 0) return null

  let product = toProductWithCategory(rows[0])

  if (domain) {
    const customizations = await getCustomizationMap(domain)
    ;[product] = applyCustomizations([product], customizations)
  }

  return product
}

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

