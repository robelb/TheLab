/**
 * The shopper's in-progress box, and the one place that knows how to read it
 * back out of storage.
 *
 * This used to live inside `BuildBoxPage` as component state. It moved here
 * when the design editor became its own route: two pages now read and write the
 * same draft, and a parser that only exists inside one of them is a parser the
 * other will re-implement slightly differently. Routing does the syncing for
 * us — navigating between `/build-box` and `/design/:id` unmounts one page and
 * mounts the other, so each reads fresh from storage on the way in.
 *
 * Everything here treats storage as untrusted. A draft can be weeks old, hand-
 * edited, or written by a build that had different fields, and the shopper's
 * work should degrade one field at a time rather than vanishing at the first
 * surprise.
 */

import { parseLayout } from '@/lib/layout'
import type { PlacementLayout } from '@/types/layout'

export const BOX_DRAFT_STORAGE_KEY = 'atelier-box-draft'

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

export interface BoxDraft {
  campaignId: string | null
  /**
   * The pre-configured box this draft started from, while it still matches it.
   *
   * Kept so the builder can charge the box's own price while nothing has been
   * changed, and show the price move to per-item the moment something is. The
   * server checks the contents again before honouring it.
   */
  bundleId: string | null
  title: string
  productIds: string[]
  /** How many of each product the box holds; a missing entry means one. */
  quantities: Record<string, number>
  /** The chosen box and filling material — both are charged for. */
  packagingId: string | null
  fillingId: string | null
  /** Designs by product id — the box included. */
  designs: Record<string, ProductDesign>
  /**
   * What the bundle photo was last rendered with. The campaign doesn't persist
   * the supplies or the designs, so this is what tells us the photo has gone
   * stale because the shopper changed something under it.
   */
  heroSupplies: string | null
  /**
   * Which image represents the box: the photographed bundle, or one of the
   * designs. Null follows the default (the bundle photo).
   */
  mainImage: string | null
  /**
   * Set while the shopper is editing a box they already put in the cart — the
   * id of that cart line, so saving writes back to it instead of adding a
   * second box.
   */
  editingItemId: string | null
}

export const EMPTY_BOX_DRAFT: BoxDraft = {
  campaignId: null,
  bundleId: null,
  title: '',
  productIds: [],
  quantities: {},
  packagingId: null,
  fillingId: null,
  designs: {},
  heroSupplies: null,
  mainImage: null,
  editingItemId: null,
}

/** Quantities come back from storage as untrusted JSON — keep whole, sane ones. */
function parseQuantities(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
      out[id] = Math.floor(value)
    }
  }
  return out
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

function parseDesigns(raw: unknown): Record<string, ProductDesign> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, ProductDesign> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const design = parseDesign(value)
    if (design) out[id] = design
  }
  return out
}

export function loadBoxDraft(): BoxDraft {
  try {
    const raw = localStorage.getItem(BOX_DRAFT_STORAGE_KEY)
    if (!raw) return EMPTY_BOX_DRAFT
    const parsed = JSON.parse(raw) as Record<string, unknown>

    const packagingId =
      typeof parsed.packagingId === 'string' ? parsed.packagingId : null
    const designs = parseDesigns(parsed.designs)

    // Drafts written before designs were keyed by product carried the box's
    // one design in three loose fields. Fold it in rather than dropping a box
    // somebody spent a render on.
    if (packagingId && !designs[packagingId] && typeof parsed.packagingImage === 'string') {
      designs[packagingId] = {
        image: parsed.packagingImage,
        prompt:
          typeof parsed.packagingPrompt === 'string'
            ? parsed.packagingPrompt
            : null,
        layout: parseLayout(parsed.packagingLayout),
      }
    }

    return {
      campaignId: typeof parsed.campaignId === 'string' ? parsed.campaignId : null,
      bundleId: typeof parsed.bundleId === 'string' ? parsed.bundleId : null,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      productIds: Array.isArray(parsed.productIds)
        ? parsed.productIds.filter((id): id is string => typeof id === 'string')
        : [],
      quantities: parseQuantities(parsed.quantities),
      packagingId,
      fillingId: typeof parsed.fillingId === 'string' ? parsed.fillingId : null,
      designs,
      heroSupplies:
        typeof parsed.heroSupplies === 'string' ? parsed.heroSupplies : null,
      mainImage: typeof parsed.mainImage === 'string' ? parsed.mainImage : null,
      editingItemId:
        typeof parsed.editingItemId === 'string' ? parsed.editingItemId : null,
    }
  } catch {
    return EMPTY_BOX_DRAFT
  }
}

export function saveBoxDraft(draft: BoxDraft): void {
  try {
    localStorage.setItem(BOX_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // A full or blocked storage quota must not take the builder down with it.
  }
}

/**
 * Write one product's design straight into stored draft.
 *
 * The design editor is a separate route with no access to the builder's state,
 * so it merges into whatever is on disk right now rather than round-tripping a
 * whole draft it never owned.
 */
export function writeDesign(
  productId: string,
  design: ProductDesign | null,
): void {
  const draft = loadBoxDraft()
  const designs = { ...draft.designs }
  const previous = designs[productId]
  if (design) designs[productId] = design
  else delete designs[productId]

  saveBoxDraft({
    ...draft,
    designs,
    // A main image pointing at a design that no longer exists would leave the
    // box showing a stale picture; fall back to the default.
    mainImage:
      previous && draft.mainImage === previous.image
        ? (design?.image ?? null)
        : draft.mainImage,
  })
}

/** The design for one product, if it has one. */
export function designFor(
  draft: BoxDraft,
  productId: string | null | undefined,
): ProductDesign | null {
  return productId ? (draft.designs[productId] ?? null) : null
}

/**
 * What the bundle photo was rendered against. Any change here means the photo
 * is showing something the shopper has since altered.
 */
export function supplySignature(draft: BoxDraft): string {
  const designs = Object.entries(draft.designs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, d]) => `${id}:${d.image}`)
    .join(',')
  return `${draft.packagingId ?? ''}|${draft.fillingId ?? ''}|${designs}`
}
