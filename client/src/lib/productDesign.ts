/**
 * Designs made for a single product, outside the box builder.
 *
 * The box builder keeps its designs in the box draft, because a design there
 * belongs to the box being assembled. A product branded from its own page has
 * no box to belong to — so before this existed, confirming such a design saved
 * the picture and threw away the placement. The request that followed carried
 * an image nobody could reproduce.
 *
 * Local, like the cart and the box draft: it only has to survive the walk from
 * the editor back to the product page and into the basket. Once a request is
 * sent, the server holds the real copy.
 */

import type { ProductDesign } from '@/lib/boxDraft'

const STORAGE_KEY = 'atelier-product-designs'

type Store = Record<string, ProductDesign>

function read(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function write(store: Store): void {
  try {
    if (Object.keys(store).length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // A blocked or full store must not take the editor down with it.
  }
}

export function readProductDesign(productId: string): ProductDesign | null {
  if (!productId) return null
  return read()[productId] ?? null
}

/** Passing `null` forgets it — what discarding a design does. */
export function writeProductDesign(
  productId: string,
  design: ProductDesign | null,
): void {
  if (!productId) return
  const store = read()
  if (design) store[productId] = design
  else delete store[productId]
  write(store)
}

/** Signing out forgets these along with the cart — they are one person's work. */
export const PRODUCT_DESIGNS_STORAGE_KEY = STORAGE_KEY
