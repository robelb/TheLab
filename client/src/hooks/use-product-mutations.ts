import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createProduct,
  deleteProduct,
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
