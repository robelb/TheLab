import { useMutation, useQuery, keepPreviousData } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  customizeBox,
  customizeProduct,
  fetchBoxSupplies,
  fetchProducts,
  fetchProductsByIds,
  searchProductsByImage,
  type CustomizeBoxRequest,
  type CustomizeProductRequest,
  type FetchProductsParams,
  type ImageSearchParams,
} from '@/api/products'
import { FILLING_SLUG, PACKAGING_SLUG } from '@/lib/box'
import type { Product } from '@/types/product'

export const productsKeys = {
  all: ['products'] as const,
  list: (params: FetchProductsParams) => ['products', 'list', params] as const,
  detail: (id: string) => ['products', 'detail', id] as const,
  byIds: (ids: string) => ['products', 'by-ids', ids] as const,
  supplies: () => ['products', 'supplies'] as const,
}

export interface BoxSupplies {
  packaging: Product[]
  filling: Product[]
}

const NO_SUPPLIES: BoxSupplies = { packaging: [], filling: [] }

/**
 * The box builder's two pickers. Sits under `['products']` like every other
 * product read, so a login (and its branded images) invalidates it too.
 */
export function useBoxSupplies() {
  const query = useQuery({
    queryKey: productsKeys.supplies(),
    queryFn: fetchBoxSupplies,
    staleTime: 5 * 60_000,
  })

  const supplies = useMemo<BoxSupplies>(() => {
    if (!query.data) return NO_SUPPLIES
    return {
      packaging: query.data.filter((p) => p.categorySlug === PACKAGING_SLUG),
      filling: query.data.filter((p) => p.categorySlug === FILLING_SLUG),
    }
  }, [query.data])

  return { ...query, supplies }
}

/**
 * Live data for a known set of product ids. Sits under the `['products']` key
 * so logging in/out — and the company's branded images becoming ready —
 * invalidates it like every other product read.
 */
export function useProductsByIds(ids: string[]) {
  // Sorted key: reordering the cart must not trigger a refetch.
  const cacheKey = [...ids].sort().join(',')
  return useQuery({
    queryKey: productsKeys.byIds(cacheKey),
    queryFn: () => fetchProductsByIds(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  })
}

/**
 * Print a design onto a gift box. A mutation rather than a query — it runs on
 * an explicit click and takes ~15s, and the caller keeps the result to preview.
 */
export function useCustomizeBox(boxId: string | undefined) {
  return useMutation({
    mutationFn: (body: CustomizeBoxRequest) => {
      if (!boxId) throw new Error('Pick a box first')
      return customizeBox(boxId, body)
    },
  })
}

/**
 * Apply a design to any product. Same shape as `useCustomizeBox` — an explicit
 * click, a ~15s wait, and the caller keeps the result — but it takes mugs and
 * notebooks as well as boxes.
 */
export function useCustomizeProduct(productId: string | undefined) {
  return useMutation({
    mutationFn: (body: CustomizeProductRequest) => {
      if (!productId) throw new Error('Nothing to design')
      return customizeProduct(productId, body)
    },
  })
}

export function useProducts(
  params: FetchProductsParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: productsKeys.list(params),
    queryFn: () => fetchProducts(params),
    placeholderData: keepPreviousData,
    // A caller whose filter is still loading passes false. Without it the first
    // render asks for the whole catalogue, and `keepPreviousData` then holds
    // that unfiltered answer on screen after the real filter arrives.
    enabled: options.enabled ?? true,
  })
}

/**
 * Image search runs on explicit submit (an upload), so it's a mutation rather
 * than a query — the caller holds onto the returned results to render them.
 */
export function useImageSearch() {
  return useMutation({
    mutationFn: (params: ImageSearchParams) => searchProductsByImage(params),
  })
}
