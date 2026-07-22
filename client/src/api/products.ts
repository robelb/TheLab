import { apiClient } from '@/lib/api-client'
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
