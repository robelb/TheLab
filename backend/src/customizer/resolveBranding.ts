/**
 * Turn whichever branding field the client sent into one fetched image.
 *
 * The client has three ways to hand us a logo — an uploaded data URL, a remote
 * URL from brand extraction, or inline SVG markup — and every generation path
 * has to collapse them the same way. This was copied into the photoshoot and
 * the box customizer independently; the compose endpoint would have been the
 * third copy.
 */

import { fetchedImageFromDataUrl } from '../photoshoot/generate.js'
import { fetchImageOptional, type FetchedImage } from './fetchImage.js'
import { fetchedImageFromInlineSvg } from './normalizeImageForAi.js'

export interface BrandingInput {
  /** An uploaded logo, base64 data URL. */
  brandingImage?: string
  /** A remote logo URL, usually the company's extracted brand logo. */
  brandingImageUrl?: string
  /** Inline SVG markup, as brand extraction returns for vector logos. */
  brandingSvg?: string
}

export interface ResolveBrandingOptions {
  /**
   * Fail the request when a supplied logo URL cannot be fetched, rather than
   * rendering without it. Use this wherever the user explicitly asked for their
   * logo — silently producing an unbranded (or model-invented) result is worse
   * than an error they can act on.
   */
  required?: boolean
  /**
   * Longest edge to keep for a raster mark. Defaults to the image-model input
   * cap; the flat mockup raises it, because nothing downstream of it is a model.
   */
  maxEdge?: number
}

export async function resolveBrandingImage(
  input: BrandingInput,
  options: ResolveBrandingOptions = {},
): Promise<FetchedImage | undefined> {
  const { maxEdge } = options
  if (input.brandingImage) {
    return fetchedImageFromDataUrl(input.brandingImage, 'logo', { maxEdge })
  }
  if (input.brandingImageUrl) {
    const fetched = await fetchImageOptional(input.brandingImageUrl, 'logo', {
      maxEdge,
    })
    if (!fetched && options.required) {
      throw new Error(
        'Could not load your logo. Check the brand logo and try again.',
      )
    }
    return fetched ?? undefined
  }
  if (input.brandingSvg) {
    return fetchedImageFromInlineSvg(input.brandingSvg, { maxEdge })
  }
  return undefined
}
