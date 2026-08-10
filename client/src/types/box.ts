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
}

export interface BoxDetails {
  /** The saved campaign this box was built from, when it has one. */
  campaignId: string | null
  lines: BoxLine[]
}
