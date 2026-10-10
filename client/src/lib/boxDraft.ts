/**
 * A design a shopper made, and the one place that knows how to read it back
 * out of storage.
 *
 * The box builder keeps its draft in `stepDraft.ts`; this file is the shape
 * of a single design, shared by that draft, the cart, a single branded
 * product and the order. Everything here treats storage as untrusted: a design
 * can be weeks old, hand-edited, or written by a build with different fields.
 */

import { parseLayout } from '@/lib/layout'
import type { PlacementLayout } from '@/types/layout'


/**
 * A design the shopper made for one product — the box, or anything inside it.
 *
 * Keyed by product id rather than held in named `packaging*` fields, because
 * "the box is special" stopped being true the moment every product became
 * designable. New subjects need no new draft fields.
 */
export interface ProductDesign {
  /** The image that represents this design — whichever of the two below is in use. */
  image: string
  /**
   * The flat composite the shopper actually confirmed. Always present on a
   * design made since confirmation became a step of its own; older drafts have
   * only `image`, so readers must treat it as optional.
   *
   * Kept apart from `photoreal` because the two are not interchangeable: the
   * flat one is exactly what prints, the other is a nicer picture of it.
   */
  flat?: string | null
  /** The photoreal render, when one was made. Optional by design. */
  photoreal?: string | null
  /** The words that produced it, so the order says what to print. */
  prompt: string | null
  /** Where things were placed, so reopening resumes rather than restarts. */
  layout: PlacementLayout | null
  /**
   * A logo used in place of the company one for this design.
   *
   * Stored as a served URL rather than a data URL: it goes into localStorage
   * alongside the rest of the draft, and a base64 logo would bloat every read
   * and write of it. The upload happens when the file is picked, so by the time
   * it lands here the server can already fetch it by URL.
   */
  logoUrl?: string | null
}


export function parseDesign(raw: unknown): ProductDesign | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.image !== 'string' || !r.image) return null
  return {
    image: r.image,
    // Drafts written before the confirmation step carried one image and no
    // idea which kind it was; leaving these null is honest about that.
    flat: typeof r.flat === 'string' ? r.flat : null,
    photoreal: typeof r.photoreal === 'string' ? r.photoreal : null,
    prompt: typeof r.prompt === 'string' ? r.prompt : null,
    layout: parseLayout(r.layout),
    logoUrl: typeof r.logoUrl === 'string' ? r.logoUrl : null,
  }
}

export function parseDesigns(raw: unknown): Record<string, ProductDesign> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, ProductDesign> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const design = parseDesign(value)
    if (design) out[id] = design
  }
  return out
}
