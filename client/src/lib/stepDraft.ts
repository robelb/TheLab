/**
 * The box builder's in-progress box, kept in localStorage so a refresh, a
 * look at the cart, a closed tab or a trip to the design editor does not lose
 * it. The editor is a separate route: it reads and writes designs here with
 * `stepDesignFor` and `writeStepDesign`, and the builder reads them back when
 * it mounts again.
 *
 * Storage is untrusted — every field is read back on its own, so one bad
 * field costs that field rather than the box.
 */
import { parseDesigns, type ProductDesign } from '@/lib/boxDraft'
import type { StickerLogo } from '@/types/box'


export const STEP_DRAFT_STORAGE_KEY = 'atelier-step-box-draft'

export const BUILDER_STEPS = [
  'products',
  'card',
  'packaging',
  'stickers',
  'review',
] as const

export type BuilderStep = (typeof BUILDER_STEPS)[number]

export interface StepDraft {
  /** The collection this box is being built for; another one starts afresh. */
  collectionSlug: string | null
  step: BuilderStep
  productIds: string[]
  /** How many of each product one box holds; a missing entry means one. */
  quantities: Record<string, number>
  cardId: string | null
  cardMessage: string
  packagingId: string | null
  fillingId: string | null
  /**
   * Designs the shopper made, keyed by product id — products in the box and
   * the box itself. Only where the page allows customising.
   */
  designs: Record<string, ProductDesign>
  /** Null is no stickers — either not chosen yet or skipped. */
  stickerId: string | null
  /** The logo for the stickers, uploaded now; null when it comes later. */
  stickerLogo: StickerLogo | null
  /** True once the shopper picked a sticker or chose to go without. */
  stickersDecided: boolean
  /** How many of this box they want. */
  boxes: number
  /**
   * The ready-made box this one was opened from. Its own price holds while
   * the contents still match it; change anything and it is priced by parts.
   */
  bundleId: string | null
  /** The campaign the box photo is rendered on, once there is one. */
  campaignId: string | null
  /** What that photo shows — see `heroKeyFor` — so a changed box re-renders. */
  heroKey: string | null
  /** The cart line being edited, when the shopper came from the cart. */
  editingItemId: string | null
}

export const EMPTY_STEP_DRAFT: StepDraft = {
  collectionSlug: null,
  step: 'products',
  productIds: [],
  quantities: {},
  cardId: null,
  cardMessage: '',
  designs: {},
  packagingId: null,
  fillingId: null,
  stickerId: null,
  stickerLogo: null,
  stickersDecided: false,
  boxes: 1,
  bundleId: null,
  campaignId: null,
  heroKey: null,
  editingItemId: null,
}

/**
 * What the box photo depends on: the products, the box, the filling and every
 * design on them — a new design is a different-looking box.
 */
export function heroKeyFor(draft: StepDraft): string {
  // Only the box is photographed as designed; products always go in plain.
  const designs = draft.packagingId ? (draft.designs[draft.packagingId]?.image ?? '') : ''
  // Not the filling: the photo shows the box closed, so it never appears.
  const key = [draft.productIds.join(','), draft.packagingId, designs].join('|')
  // The sticker is on the box in the photo. Appended only when there is one,
  // so boxes without a sticker keep the key — and the photo — they had.
  if (!draft.stickerId) return key
  // A designed sticker is photographed as designed, so a new design is a new photo.
  const stickerArt = draft.designs[draft.stickerId]?.image
  return `${key}|sticker:${draft.stickerId}${stickerArt ? `:${stickerArt}` : ''}`
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

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

function parseStickerLogo(raw: unknown): StickerLogo | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.url !== 'string' || !/^https?:\/\//.test(r.url)) return null
  return { url: r.url, name: typeof r.name === 'string' ? r.name : null }
}

export function loadStepDraft(): StepDraft {
  try {
    const raw = localStorage.getItem(STEP_DRAFT_STORAGE_KEY)
    if (!raw) return EMPTY_STEP_DRAFT
    const r = JSON.parse(raw) as Record<string, unknown>
    if (!r || typeof r !== 'object') return EMPTY_STEP_DRAFT
    const step = BUILDER_STEPS.includes(r.step as BuilderStep)
      ? (r.step as BuilderStep)
      : 'products'
    const boxes =
      typeof r.boxes === 'number' && Number.isFinite(r.boxes) && r.boxes >= 1
        ? Math.floor(r.boxes)
        : 1
    return {
      collectionSlug: str(r.collectionSlug),
      step,
      productIds: Array.isArray(r.productIds)
        ? r.productIds.filter((id): id is string => typeof id === 'string')
        : [],
      quantities: parseQuantities(r.quantities),
      cardId: str(r.cardId),
      cardMessage: typeof r.cardMessage === 'string' ? r.cardMessage : '',
      designs: parseDesigns(r.designs),
      packagingId: str(r.packagingId),
      fillingId: str(r.fillingId),
      stickerId: str(r.stickerId),
      stickerLogo: parseStickerLogo(r.stickerLogo),
      stickersDecided: r.stickersDecided === true,
      boxes,
      bundleId: str(r.bundleId),
      campaignId: str(r.campaignId),
      heroKey: str(r.heroKey),
      editingItemId: str(r.editingItemId),
    }
  } catch {
    return EMPTY_STEP_DRAFT
  }
}

export function saveStepDraft(draft: StepDraft): void {
  try {
    localStorage.setItem(STEP_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Private mode or a full quota: the box still works, it just won't survive
    // a reload.
  }
}

/** The design for one product in the box being built, if it has one. */
export function stepDesignFor(productId: string | null | undefined): ProductDesign | null {
  return productId ? (loadStepDraft().designs[productId] ?? null) : null
}

/**
 * Write one product's design straight into the stored draft, or remove it.
 * For the design editor, which has no access to the builder's state, so it
 * merges into whatever is on disk rather than round-tripping a whole draft.
 */
export function writeStepDesign(productId: string, design: ProductDesign | null): void {
  const draft = loadStepDraft()
  const designs = { ...draft.designs }
  if (design) designs[productId] = design
  else delete designs[productId]
  saveStepDraft({ ...draft, designs })
}
