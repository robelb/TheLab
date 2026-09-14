import type { ProductDesign } from '@/lib/boxDraft'
import type { PlacementLayout } from '@/types/layout'

/**
 * A built gift box enters the cart as a single line item, so the products it
 * holds are snapshotted onto that line — the cart, the checkout summary and the
 * "edit box" round-trip all read them from here rather than refetching.
 */
export interface BoxLine {
  productId: string
  name: string
  /** Unit price at the time the box was built. */
  price: number
  currency?: string
  /** How many of this product the box contains. */
  quantity: number
  image: string
  /**
   * A design the shopper made for THIS box, and nothing else.
   *
   * Deliberately NOT the company's own branded catalogue shot. Inside the box
   * builder every product is something you can open in the design editor, so a
   * tile arriving pre-branded is misleading: it looks finished when nothing has
   * been placed on it yet, and it hides the plain surface you are about to
   * design on. Products show their catalogue photo until the shopper actually
   * designs one.
   */
  customizedImage: string | null
  /**
   * Set whenever `customizedImage` holds one of those designs. The cart's image
   * refresh skips these lines — re-reading the catalog product would replace
   * the shopper's artwork with stock.
   */
  customPrint?: boolean
}

export interface BoxDetails {
  /** The saved campaign this box was built from, when it has one. */
  campaignId: string | null
  /**
   * The pre-configured box this one is, while it still is one.
   *
   * Set when a shopper takes a ready-made box as sold, and cleared the moment
   * they change what is inside it — a box that is no longer that box must not
   * keep claiming its price. The server checks the contents again before
   * honouring it, so this is a claim rather than an authority.
   */
  bundleId?: string | null
  /**
   * The sticker price that goes with `bundleId`, for showing a total before
   * anything is sent. The server prices the request from the catalogue row.
   */
  bundlePrice?: number | null
  /** The products the shopper picked. */
  lines: BoxLine[]
  /**
   * The box itself and what's packed around the products. Both are charged for
   * alongside the contents. Optional because boxes built before supplies were
   * offered have neither.
   */
  packaging?: BoxLine | null
  filling?: BoxLine | null
  /**
   * The wording that produced the box's printed design, when the shopper
   * customized it. The design itself is the packaging line's `customizedImage`;
   * this is kept so re-opening the box can show what was asked for, and so the
   * order says what to print.
   */
  packagingPrompt?: string | null
  /**
   * Where the shopper dragged the logo and any wording onto the box. Kept
   * alongside the prompt so re-opening the box resumes the placement rather
   * than starting from a blank lid — that layout is the one part of the flow
   * that represents real manual work.
   */
  packagingLayout?: PlacementLayout | null
  /**
   * Every design in this box, keyed by product id — the box and each product
   * inside it. The rendered images already ride on the lines as
   * `customizedImage`; this keeps the layout and brief that produced them, so
   * editing the box out of the cart resumes each design rather than restarting.
   */
  designs?: Record<string, ProductDesign>
}
