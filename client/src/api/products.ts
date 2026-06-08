import { apiClient } from '@/lib/api-client'
import type { Product, ProductsResponse, PageSize } from '@/types/product'

export interface FetchProductsParams {
  page: number
  limit: PageSize
  category?: string
  q?: string
  minPrice?: number
  maxPrice?: number
  domain?: string
}

export interface ImageSearchParams {
  /** Data URL (`data:<mime>;base64,...`) or raw base64 string. */
  image: string
  category?: string
  minPrice?: number
  maxPrice?: number
  domain?: string
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
  if (params.domain) body.domain = params.domain
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
  if (params.q?.trim()) {
    search.q = params.q.trim()
  }
  if (params.minPrice !== undefined && !Number.isNaN(params.minPrice)) {
    search.minPrice = String(params.minPrice)
  }
  if (params.maxPrice !== undefined && !Number.isNaN(params.maxPrice)) {
    search.maxPrice = String(params.maxPrice)
  }
  if (params.domain) {
    search.domain = params.domain
  }

  const { data } = await apiClient.get<ProductsResponse>('/products', {
    params: search,
  })
  return data
}

export async function fetchProduct(
  id: string,
  domain?: string,
): Promise<Product> {
  const params = domain ? { domain } : undefined
  const { data } = await apiClient.get<Product>(
    `/products/${encodeURIComponent(id)}`,
    { params },
  )
  return data
}

export async function fetchRelatedProducts(
  id: string,
  limit = 4,
  domain?: string,
): Promise<Product[]> {
  const params: Record<string, string | number> = { limit }
  if (domain) params.domain = domain
  const { data } = await apiClient.get<{ data: Product[] }>(
    `/products/${encodeURIComponent(id)}/related`,
    { params },
  )
  return data.data
}
