import { apiClient } from '@/lib/api-client'
import type { PlacementLayout } from '@/types/layout'

export interface ComposeRequest {
  /** The photo to paste onto — a product image or a box image. */
  baseImageUrl: string
  layout: PlacementLayout
  /** The logo, however the caller has it. */
  brandingImage?: string
  brandingImageUrl?: string
  brandingSvg?: string
}

export interface ComposeResponse {
  url: string
  /**
   * The mark's black and white were inverted so it stays readable on this
   * surface. The editor's canvas cannot predict this — it would have to sample
   * the base photo, and reading those pixels taints on a cross-origin logo — so
   * the server reports it and the confirmation step says so in words.
   */
  contrastSwapped: boolean
}

/**
 * Flatten a layout onto a photo — no image model, no cost, back in well under a
 * second. The same server-side compositor also builds the edit base for the
 * photoreal pass, so what comes back here is what that pass is asked to render.
 */
export async function composeMockup(
  body: ComposeRequest,
): Promise<ComposeResponse> {
  const { data } = await apiClient.post<ComposeResponse>('/compose', body)
  return data
}
