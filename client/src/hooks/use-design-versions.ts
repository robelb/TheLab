import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createDesignVersion,
  deleteDesignVersion,
  fetchDesignVersions,
  renameDesignVersion,
  type CreateDesignVersionBody,
  type DesignVersion,
} from '@/api/designVersions'
import { useAuth } from '@/context/AuthContext'

export const designVersionKeys = {
  all: ['design-versions'] as const,
  list: (productId: string) => ['design-versions', productId] as const,
}

const NO_VERSIONS: DesignVersion[] = []

/**
 * A product's saved versions, newest first.
 *
 * Only fetched for a signed-in company — the server has nothing to scope a
 * version to otherwise, and asking would just be a 401 per page load. A guest
 * gets an empty list and an editor that works exactly as before, minus history.
 */
export function useDesignVersions(productId: string) {
  const { user } = useAuth()
  const enabled = Boolean(productId) && Boolean(user?.companyId)

  const query = useQuery({
    queryKey: designVersionKeys.list(productId),
    queryFn: () => fetchDesignVersions(productId),
    enabled,
  })

  return {
    versions: query.data ?? NO_VERSIONS,
    isLoading: query.isLoading && enabled,
    /** Whether saving is possible at all — drives the button, not an error. */
    canSave: enabled,
  }
}

function useInvalidateVersions(productId: string) {
  const client = useQueryClient()
  return () =>
    client.invalidateQueries({ queryKey: designVersionKeys.list(productId) })
}

export function useCreateDesignVersion(productId: string) {
  const invalidate = useInvalidateVersions(productId)
  return useMutation({
    mutationFn: (body: CreateDesignVersionBody) =>
      createDesignVersion(productId, body),
    onSuccess: invalidate,
  })
}

export function useRenameDesignVersion(productId: string) {
  const invalidate = useInvalidateVersions(productId)
  return useMutation({
    mutationFn: (vars: { versionId: string; label: string }) =>
      renameDesignVersion(vars.versionId, vars.label),
    onSuccess: invalidate,
  })
}

export function useDeleteDesignVersion(productId: string) {
  const invalidate = useInvalidateVersions(productId)
  return useMutation({
    mutationFn: (versionId: string) => deleteDesignVersion(versionId),
    onSuccess: invalidate,
  })
}
