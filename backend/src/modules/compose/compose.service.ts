/**
 * The flat mockup: the shopper's layout pasted onto the product photo, with no
 * image model involved.
 *
 * It exists because placing a logo should not cost fifteen seconds and an API
 * call per nudge. This returns in a few hundred milliseconds and is free, which
 * makes it the thing shoppers actually iterate against — the photoreal pass is
 * for once they have decided. It also produces exactly the bytes that pass will
 * use as its edit base, so approving a mockup means approving what the model is
 * asked to reproduce.
 */

import {
  composeLayout,
  fetchLayoutAssets,
} from '../../customizer/composeLayout.js'
import { fetchImage } from '../../customizer/fetchImage.js'
import { resolveBrandingImage } from '../../customizer/resolveBranding.js'
import {
  RENDER_IMAGE_OPTIONS,
  saveRenderedImage,
} from '../uploads/uploads.service.js'
import type { ComposeBody } from './compose.schema.js'

export interface ComposeResult {
  url: string
}

/**
 * How big the pieces of this mockup are allowed to be.
 *
 * Everything here used to come through the image-model input path, which caps
 * its inputs at 1024px because a model discards detail beyond its own output
 * size. Nothing downstream of THIS render is a model — it goes straight to a
 * person deciding whether to place an order — so the cap only cost them the
 * sharpness they were looking for, on a photo they had just seen at full size
 * in the editor. Matched to what the save re-encodes at, so the extra detail
 * survives to the file rather than being resized away a step later.
 */
const MOCKUP_MAX_EDGE = RENDER_IMAGE_OPTIONS.maxDimension

export async function composeMockup(params: ComposeBody): Promise<ComposeResult> {
  const base = await fetchImage(params.baseImageUrl, 'product', {
    maxEdge: MOCKUP_MAX_EDGE,
  })
  // Required: a layout with a logo layer and no logo is a blank mockup, which
  // reads as the feature being broken rather than the logo failing to load.
  const branding = await resolveBrandingImage(params, {
    required: true,
    maxEdge: MOCKUP_MAX_EDGE,
  })

  const assets = await fetchLayoutAssets(params.layout, {
    maxEdge: MOCKUP_MAX_EDGE,
  })
  // Grow the canvas to whatever the placed elements can fill, up to the same
  // ceiling — see `ComposeOptions.maxEdge`. The photograph alone is not the
  // measure of how much detail this render is carrying.
  const buffer = await composeLayout(base, params.layout, branding, assets, {
    maxEdge: MOCKUP_MAX_EDGE,
  })
  // Its own prefix — box renders already share `productPicture/` with plain
  // uploads and cannot be told apart by path. Don't add a third such kind.
  const url = await saveRenderedImage(buffer.toString('base64'), {
    prefix: 'composite',
  })

  return { url }
}
