/** Product shape returned by the API (camelCase, joined with category). */
import {
  normalizePublicImageUrl,
  normalizePublicImageUrls,
} from '../lib/publicImageUrl.js'

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
  images: string[]
  customizedImage: string | null
  description: string
  details: string[]
  isFeatured: boolean
}

/** Drizzle select result row (camelCase, matches column aliases). */
export interface ProductRow {
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
  images: string[] | null
  customizedImage: string | null
  description: string
  details: string[] | null
  isFeatured: boolean
  createdAt: Date
  updatedAt: Date
  categoryName: string
  categorySlug: string
}

/** Raw SQL result row (snake_case, from neon tagged templates). */
export interface RawProductRow {
  id: string
  source_id: string
  variant_id: string | null
  sku: string
  name: string
  tagline: string
  price: string
  currency: string
  stock: number
  image: string
  images: string[] | null
  customized_image: string | null
  description: string
  details: string[] | null
  is_featured: boolean
  created_at: Date
  updated_at: Date
  category_name: string
  category_slug: string
}

/** Raw product from normalizedProducts.json (seed data). */
export interface RawProductJson {
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
}

export interface ListProductsParams {
  page: number
  limit: number
  category?: string
  /** Multi-select category filter (names or slugs). Takes precedence over `category`. */
  categories?: string[]
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

export function toProductWithCategory(row: ProductRow): ProductWithCategory {
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
    image: normalizePublicImageUrl(row.image) ?? row.image,
    images: normalizePublicImageUrls(
      row.images?.length ? row.images : [row.image],
    ),
    customizedImage: normalizePublicImageUrl(row.customizedImage),
    description: row.description,
    details: row.details ?? [],
    isFeatured: row.isFeatured,
  }
}

export function rawRowToProductRow(row: RawProductRow): ProductRow {
  return {
    id: row.id,
    sourceId: row.source_id,
    variantId: row.variant_id,
    sku: row.sku,
    name: row.name,
    tagline: row.tagline,
    price: row.price,
    currency: row.currency,
    stock: row.stock,
    categoryId: '',
    image: row.image,
    images: row.images,
    customizedImage: row.customized_image,
    description: row.description,
    details: row.details,
    isFeatured: row.is_featured,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
  }
}
