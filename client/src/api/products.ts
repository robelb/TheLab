import type { Product, ProductsResponse, PageSize } from '@/types/product'

export async function fetchProducts(params: {
  page: number
  limit: PageSize
  category?: string
  q?: string
  minPrice?: number
  maxPrice?: number
}): Promise<ProductsResponse> {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  })
  if (params.category && params.category !== 'all') {
    search.set('category', params.category)
  }
  if (params.q?.trim()) {
    search.set('q', params.q.trim())
  }
  if (params.minPrice !== undefined && !Number.isNaN(params.minPrice)) {
    search.set('minPrice', String(params.minPrice))
  }
  if (params.maxPrice !== undefined && !Number.isNaN(params.maxPrice)) {
    search.set('maxPrice', String(params.maxPrice))
  }

  const response = await fetch(`/api/products?${search}`)
  const body = (await response.json()) as ProductsResponse | { error?: string }

  if (!response.ok) {
    throw new Error(
      'error' in body && body.error
        ? body.error
        : 'Failed to load products',
    )
  }

  return body as ProductsResponse
}

export async function fetchProduct(id: string): Promise<Product> {
  const response = await fetch(`/api/products/${encodeURIComponent(id)}`)
  const body = (await response.json()) as Product | { error?: string }

  if (!response.ok) {
    throw new Error(
      'error' in body && body.error ? body.error : 'Product not found',
    )
  }

  return body as Product
}
