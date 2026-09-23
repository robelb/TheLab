import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import {
  createCollection,
  deleteCollection,
  fetchAllCollections,
  fetchCollectionProducts,
  setCollectionProducts,
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

const memberKey = (id: string) => ['collections', 'products', id] as const

/** What is on this collection's page right now. */
export function useCollectionProducts(id: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: memberKey(id ?? ''),
    queryFn: () => fetchCollectionProducts(id!),
    enabled: Boolean(id) && Boolean(user),
  })
}

export function useSetCollectionProducts(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (changes: { add?: string[]; remove?: string[] }) =>
      setCollectionProducts(id, changes),
    // The answer is the new membership, so it goes straight into the cache
    // rather than causing a refetch of what we were just handed.
    onSuccess: (data) => {
      client.setQueryData(memberKey(id), data)
      void client.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
