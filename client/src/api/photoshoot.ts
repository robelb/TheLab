import { apiClient } from '@/lib/api-client'
import type { PlacementLayout } from '@/types/layout'

/**
 * The scene id that means "leave the photograph alone" — brand the product and
 * change nothing else. Mirrors `KEEP_SCENE_ID` on the server.
 */
export const KEEP_SCENE_ID = 'as-is'

/** Scene presets — mirrors backend/src/systemInstruction/productPhotoshoot.ts. */
export const SCENE_TYPES = [
  { id: KEEP_SCENE_ID, label: 'Keep the product photo' },
  { id: 'studio-hero', label: 'Studio hero' },
  { id: 'editorial-tabletop', label: 'Editorial tabletop' },
  { id: 'work-desk-lifestyle', label: 'Work-desk lifestyle' },
  { id: 'human-interaction', label: 'Human interaction' },
  { id: 'wearable-fashion', label: 'Wearable fashion' },
] as const

/** Output aspect ratios — mirrors backend ASPECT_RATIOS. */
export const ASPECT_RATIOS = [
  { id: 'square', label: 'Square 1:1' },
  { id: 'portrait', label: 'Portrait 2:3' },
  { id: 'landscape', label: 'Landscape 3:2' },
] as const

export interface PhotoshootRequest {
  sceneType: string
  /** Output aspect ratio: square | portrait | landscape. */
  aspectRatio: string
  /** Image B — URL of the product image to use as the product reference. */
  productImageUrl: string
  /** Iterative refinement: a previously generated image URL to edit further. */
  baseImageUrl?: string
  /** Optional extra direction. */
  prompt?: string
  /** Image A — style reference as a data URL. */
  styleImage?: string
  /** Image C — branding reference. Defaults to the company logo. Provide one
   *  of: a data URL upload, a remote logo URL, or inline SVG markup. */
  brandingImage?: string
  brandingImageUrl?: string
  brandingSvg?: string
  /**
   * Where the user placed the branding. Takes the edit-base slot — the server
   * ignores both `baseImageUrl` and `styleImage` when this is set.
   */
  layout?: PlacementLayout
}

export interface PhotoshootResponse {
  /** URL of the generated image (already saved server-side). */
  url: string
  /** The full prompt that was sent to the model. */
  prompt: string
}

export async function generateProductPhoto(
  productId: string,
  body: PhotoshootRequest,
): Promise<PhotoshootResponse> {
  const { data } = await apiClient.post<PhotoshootResponse>(
    `/products/${encodeURIComponent(productId)}/photoshoot`,
    body,
  )
  return data
}
