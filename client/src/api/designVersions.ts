import { apiClient } from '@/lib/api-client'
import type { PlacementLayout } from '@/types/layout'

/**
 * A saved state of a design — the whole set, never a loose picture.
 *
 * The photo it was built on, the flat composite that says exactly what prints,
 * the optional photoreal render, and the layout that produced both travel
 * together. Restoring a render next to a layout that never made it is a
 * mismatch nobody spots until an order ships.
 */
export interface DesignVersion {
  id: string
  /** Whatever the person called it. Renameable. */
  label: string
  /** ISO strings from the server. */
  createdAt: string
  updatedAt: string
  /** The photo this was designed on. */
  source: string
  /** The flat composite. Absent when the design was briefed purely in words. */
  flat: string | null
  /** The photoreal render, when one was made. */
  photoreal: string | null
  prompt: string | null
  layout: PlacementLayout | null
  logoUrl: string | null
}

export interface CreateDesignVersionBody {
  label?: string
  source: string
  flat?: string | null
  photoreal?: string | null
  prompt?: string | null
  layout?: PlacementLayout | null
  logoUrl?: string | null
}

export async function fetchDesignVersions(
  productId: string,
): Promise<DesignVersion[]> {
  const { data } = await apiClient.get<DesignVersion[]>(
    `/products/${productId}/design-versions`,
  )
  return data
}

export async function createDesignVersion(
  productId: string,
  body: CreateDesignVersionBody,
): Promise<DesignVersion> {
  const { data } = await apiClient.post<DesignVersion>(
    `/products/${productId}/design-versions`,
    body,
  )
  return data
}

export async function renameDesignVersion(
  versionId: string,
  label: string,
): Promise<DesignVersion> {
  const { data } = await apiClient.patch<DesignVersion>(
    `/design-versions/${versionId}`,
    { label },
  )
  return data
}

export async function deleteDesignVersion(versionId: string): Promise<void> {
  await apiClient.delete(`/design-versions/${versionId}`)
}
