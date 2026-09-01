import { apiClient } from '@/lib/api-client'
import type { PlacementLayout } from '@/types/layout'
import type { Product, ProductsResponse, PageSize } from '@/types/product'
import type { ProductInput } from '@/types/dashboard'

export interface FetchProductsParams {
  page: number
  limit: PageSize
  category?: string
  /** Multi-select category filter (names). Sent as a comma-separated list. */
  categories?: string[]
  q?: string
  minPrice?: number
  maxPrice?: number
  /** Brand color (hex). When set, results are sorted by color similarity. */
  brandColor?: string
  /**
   * Keep featured products pinned first under color sort. True (default) for the
   * initial brand color; false once the user picks a color to filter by, so
   * results sort purely by color.
   */
  pinFeatured?: boolean
  /**
   * Include box-building supplies (packaging, filling material), which the shop
   * never shows. Only the dashboard sets this — it manages them alongside
   * catalog products.
   */
  includeSupplies?: boolean
}

export interface ImageSearchParams {
  /** Data URL (`data:<mime>;base64,...`) or raw base64 string. */
  image: string
  category?: string
  minPrice?: number
  maxPrice?: number
  limit?: number
}

export interface ImageSearchResponse extends ProductsResponse {
  caption: string
}

export async function searchProductsByImage(
  params: ImageSearchParams,
): Promise<ImageSearchResponse> {
  const body: Record<string, string | number> = { image: params.image }

  if (params.category && params.category !== 'all') {
    body.category = params.category
  }
  if (params.minPrice !== undefined && !Number.isNaN(params.minPrice)) {
    body.minPrice = params.minPrice
  }
  if (params.maxPrice !== undefined && !Number.isNaN(params.maxPrice)) {
    body.maxPrice = params.maxPrice
  }
  if (params.limit) body.limit = params.limit

  const { data } = await apiClient.post<ImageSearchResponse>(
    '/products/search/image',
    body,
  )
  return data
}

export async function fetchProducts(
  params: FetchProductsParams,
): Promise<ProductsResponse> {
  const search: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  }

  if (params.category && params.category !== 'all') {
    search.category = params.category
  }
  if (params.categories?.length) {
    search.categories = params.categories.join(',')
  }
  if (params.q?.trim()) {
    search.q = params.q.trim()
  }
  if (params.minPrice !== undefined && !Number.isNaN(params.minPrice)) {
    search.minPrice = String(params.minPrice)
  }
  if (params.maxPrice !== undefined && !Number.isNaN(params.maxPrice)) {
    search.maxPrice = String(params.maxPrice)
  }
  if (params.brandColor) {
    search.brandColor = params.brandColor
  }
  // Only send when disabling the featured pin (a user-picked color); the backend
  // defaults to pinning featured first for the initial brand color.
  if (params.pinFeatured === false) {
    search.pinFeatured = 'false'
  }
  if (params.includeSupplies) {
    search.includeSupplies = 'true'
  }

  const { data } = await apiClient.get<ProductsResponse>('/products', {
    params: search,
  })
  return data
}

export async function fetchProduct(id: string): Promise<Product> {
  const { data } = await apiClient.get<Product>(
    `/products/${encodeURIComponent(id)}`,
  )
  return data
}

/**
 * Batch lookup used to refresh stored product snapshots (the cart) against live
 * data, so branded images generated after an item was added still show up.
 * Missing/deleted ids are simply absent from the result.
 */
export async function fetchProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return []
  const { data } = await apiClient.get<{ data: Product[] }>('/products/by-ids', {
    params: { ids: ids.join(',') },
  })
  return data.data
}

/**
 * Boxes and filling materials for the box builder. These are `isSupply`
 * products, which every other product read filters out — this is the only
 * endpoint that returns them.
 */
export async function fetchBoxSupplies(): Promise<Product[]> {
  const { data } = await apiClient.get<{ data: Product[] }>(
    '/products/supplies',
  )
  return data.data
}

export interface CustomizeBoxRequest {
  /** What the shopper wants printed, in their own words. */
  prompt: string
  color?: string
  /** A previous render to iterate on, so tweaks build on each other. */
  baseImageUrl?: string
  /** Optional logo applied alongside the design. */
  brandingImage?: string
  brandingImageUrl?: string
  brandingSvg?: string
  /**
   * Where the shopper placed the logo and any wording. Takes the edit-base slot
   * from `baseImageUrl` — the server ignores a refine base when this is set.
   */
  layout?: PlacementLayout
}

export interface CustomizeBoxResponse {
  url: string
  prompt: string
}

/** Render the chosen gift box with a design printed on it. */
export async function customizeBox(
  id: string,
  body: CustomizeBoxRequest,
): Promise<CustomizeBoxResponse> {
  const { data } = await apiClient.post<CustomizeBoxResponse>(
    `/products/${encodeURIComponent(id)}/customize-box`,
    body,
  )
  return data
}

export interface CustomizeProductRequest {
  /** What the user wants, in their own words. */
  prompt?: string
  /** A previous render to iterate on. Ignored by the server when a layout is set. */
  baseImageUrl?: string
  /** Where the user placed the logo and any wording. */
  layout?: PlacementLayout
  brandingImage?: string
  brandingImageUrl?: string
  brandingSvg?: string
  /** Packaging only — which stock board colour. */
  color?: string
  /** Everything else — how the product is staged. */
  sceneType?: string
  aspectRatio?: string
  /** Which of the product's images to work from; defaults to its cover. */
  productImageUrl?: string
}

/**
 * Apply a design to any product — a box, a mug, a notebook.
 *
 * One endpoint for every subject: the server dispatches on the product's
 * category, so the editor never has to know that a box is printed and a mug is
 * photographed.
 */
export async function customizeProduct(
  id: string,
  body: CustomizeProductRequest,
): Promise<CustomizeBoxResponse> {
  const { data } = await apiClient.post<CustomizeBoxResponse>(
    `/products/${encodeURIComponent(id)}/customize`,
    body,
  )
  return data
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data } = await apiClient.post<Product>('/products', input)
  return data
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInput>,
): Promise<Product> {
  const { data } = await apiClient.patch<Product>(
    `/products/${encodeURIComponent(id)}`,
    input,
  )
  return data
}

export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete(`/products/${encodeURIComponent(id)}`)
}

export async function fetchRelatedProducts(
  id: string,
  limit = 4,
): Promise<Product[]> {
  const { data } = await apiClient.get<{ data: Product[] }>(
    `/products/${encodeURIComponent(id)}/related`,
    { params: { limit } },
  )
  return data.data
}

/**
 * Keep a confirmed design in the company's own gallery for this product.
 *
 * Company-scoped server-side, so it shows up as a source image for this
 * company's people and nobody else's. Requires a signed-in company; callers
 * treat a failure as non-fatal, since the design is already saved locally.
 */
export async function saveProductGalleryImage(
  productId: string,
  body: { imageUrl: string; prompt?: string },
): Promise<void> {
  await apiClient.post(`/products/${productId}/images`, body)
}
