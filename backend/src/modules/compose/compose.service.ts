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
  type ComposeNotes,
} from '../../customizer/composeLayout.js'
import { fetchImage } from '../../customizer/fetchImage.js'
import { resolveBrandingImage } from '../../customizer/resolveBranding.js'
import { saveRenderedImage } from '../uploads/uploads.service.js'
import type { ComposeBody } from './compose.schema.js'

export interface ComposeResult {
  url: string
  /**
   * The mark's black and white were inverted so it reads against the surface.
   *
   * Reported because the editor's canvas cannot know: it would have to sample
   * the base photo, and reading those pixels taints on a cross-origin logo.
   * Without this the mark is simply black on the canvas and white in the
   * mockup, which reads as a bug rather than the deliberate legibility rule it
   * is — so the confirmation step says so in words instead.
   */
  contrastSwapped: boolean
}

export async function composeMockup(params: ComposeBody): Promise<ComposeResult> {
  const base = await fetchImage(params.baseImageUrl, 'product')
  // Required: a layout with a logo layer and no logo is a blank mockup, which
  // reads as the feature being broken rather than the logo failing to load.
  const branding = await resolveBrandingImage(params, { required: true })

  const assets = await fetchLayoutAssets(params.layout)
  const notes: ComposeNotes = { contrastSwapped: false }
  const buffer = await composeLayout(base, params.layout, branding, assets, notes)
  // Its own prefix — box renders already share `productPicture/` with plain
  // uploads and cannot be told apart by path. Don't add a third such kind.
  const url = await saveRenderedImage(buffer.toString('base64'), {
    prefix: 'composite',
  })

  return { url, contrastSwapped: notes.contrastSwapped }
}
