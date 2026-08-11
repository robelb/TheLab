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
  customizedImage: string | null
  /**
   * `customizedImage` is a design generated for THIS box, not a catalog image.
   * The cart's image refresh skips these lines — re-reading the catalog product
   * would replace the shopper's print with the plain box.
   */
  customPrint?: boolean
}

export interface BoxDetails {
  /** The saved campaign this box was built from, when it has one. */
  campaignId: string | null
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
}
