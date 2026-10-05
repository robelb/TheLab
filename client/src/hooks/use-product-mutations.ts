import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createProduct,
  deleteProduct,
  saveProductGalleryImage,
  setProductsFeatured,
  updateProduct,
} from '@/api/products'
import {
  generateProductPhoto,
  type PhotoshootRequest,
} from '@/api/photoshoot'
import type { ProductInput } from '@/types/dashboard'
import { productsKeys } from './use-products'

/** Invalidate every cache that reflects the product catalog. */
function useInvalidateProducts() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: productsKeys.all })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export function useCreateProduct() {
  const invalidate = useInvalidateProducts()
  return useMutation({
    mutationFn: (input: ProductInput) => createProduct(input),
    onSuccess: invalidate,
  })
}

export function useUpdateProduct() {
  const invalidate = useInvalidateProducts()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ProductInput> }) =>
      updateProduct(id, input),
    onSuccess: invalidate,
  })
}

/**
 * Keep a confirmed design among this company's own images for a product, so it
 * comes back as something to design on. Server-side it is company-scoped; the
 * global catalog row stays plain.
 */
export function useSaveProductGalleryImage(productId: string) {
  const invalidate = useInvalidateProducts()
  return useMutation({
    mutationFn: (body: { imageUrl: string; prompt?: string }) =>
      saveProductGalleryImage(productId, body),
    onSuccess: invalidate,
  })
}

export function useSetProductsFeatured() {
  const invalidate = useInvalidateProducts()
  return useMutation({
    mutationFn: ({ ids, isFeatured }: { ids: string[]; isFeatured: boolean }) =>
      setProductsFeatured(ids, isFeatured),
    onSuccess: invalidate,
  })
}

export function useDeleteProduct() {
  const invalidate = useInvalidateProducts()
  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: invalidate,
  })
}

export function useProductPhotoshoot(productId: string) {
  return useMutation({
    mutationFn: (body: PhotoshootRequest) =>
      generateProductPhoto(productId, body),
  })
}
