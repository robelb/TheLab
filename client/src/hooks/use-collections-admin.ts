import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import {
  createCollection,
  deleteCollection,
  fetchAllCollections,
  updateCollection,
  type CollectionInput,
} from '@/api/collections-admin'
import { collectionKeys } from '@/hooks/use-collections'

const adminKey = ['collections', 'admin'] as const

/** Every collection, ended ones included. Administrator only. */
export function useAllCollections() {
  const { user } = useAuth()
  return useQuery({
    queryKey: adminKey,
    queryFn: fetchAllCollections,
    enabled: Boolean(user),
  })
}

function useInvalidate() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: adminKey })
    void client.invalidateQueries({ queryKey: collectionKeys.all })
  }
}

export function useCreateCollection() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: CollectionInput) => createCollection(input),
    onSuccess: invalidate,
  })
}

export function useUpdateCollection() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<CollectionInput> }) =>
      updateCollection(vars.id, vars.input),
    onSuccess: invalidate,
  })
}

export function useDeleteCollection() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => deleteCollection(id),
    onSuccess: invalidate,
  })
}
