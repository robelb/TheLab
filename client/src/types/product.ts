export interface Product {
  id: string
  sourceId?: string
  variantId?: string | null
  sku?: string
  name: string
  tagline: string
  price: number
  currency?: string
  stock?: number
  category: string
  categorySlug?: string
  image: string
  customizedImage: string | null
  description: string
  details: string[]
}

export interface ProductsPagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface PriceRange {
  min: number
  max: number
}

export interface ProductsResponse {
  data: Product[]
  categories: string[]
  priceRange?: PriceRange
  pagination: ProductsPagination
}

export const PAGE_SIZE_OPTIONS = [20, 40, 60] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
