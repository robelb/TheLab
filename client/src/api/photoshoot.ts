import { apiClient } from '@/lib/api-client'

/** Scene presets — mirrors backend/src/photoshoot/prompt.ts SCENE_TYPES. */
export const SCENE_TYPES = [
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
