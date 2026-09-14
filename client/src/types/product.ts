/** An ordinary item, or a pre-configured box made of other items. */
export type ProductKind = 'single' | 'bundle'

/** What a component sits in a pre-configured box as. */
export type ComponentRole = 'item' | 'packaging' | 'filling'

/**
 * One line of a pre-configured box's parts list.
 *
 * The component is the whole product, so the box can be shown, opened in the
 * builder and priced without another round trip.
 */
export interface BundleComponent {
  product: Product
  quantity: number
  role: ComponentRole
  sortOrder: number
}

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
  images?: string[]
  customizedImage: string | null
  description: string
  details: string[]
  isFeatured?: boolean
  /** Dominant color (hex) used for brand-color similarity sorting. */
  dominantColor?: string | null
  /** `bundle` is a pre-configured box with a price of its own. */
  kind?: ProductKind
  /** Occasion slugs, e.g. `christmas`. What a landing page filters by. */
  tags?: string[]
  /** Smallest order the supplier accepts. */
  minQuantity?: number
  /** What is inside, on a bundle read one at a time. */
  components?: BundleComponent[]
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

/** How the server understood a typed query (price bound extracted by the LLM). */
export interface InterpretedQuery {
  original: string
  cleaned: string
  minPrice?: number
  maxPrice?: number
}

export interface ProductsResponse {
  data: Product[]
  categories: string[]
  priceRange?: PriceRange
  interpretedQuery?: InterpretedQuery
  pagination: ProductsPagination
}

export const PAGE_SIZE_OPTIONS = [20, 40, 60] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
