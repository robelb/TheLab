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
