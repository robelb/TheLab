import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePostHog } from '@posthog/react'
import { useProductsByIds } from '@/hooks/use-products'
import {
  baseProductId,
  boxAllLines,
  CART_VARIANT_SEPARATOR,
  cartLineCatalogueId,
  cartLinePrice,
  cartLineUnavailable,
  isBoxSku,
  type LiveCatalogue,
} from '@/lib/box'
import type { ProductDesign } from '@/lib/boxDraft'
import { MAX_LINE_QUANTITY } from '@/lib/pricing'
import type { BoxDetails, BoxLine } from '@/types/box'
import type { Product } from '@/types/product'

export interface CartItem {
  product: Product
  quantity: number
  /** Present when the line is a built gift box — the products inside it. */
  box?: BoxDetails
  /**
   * Present when this single product was branded in the editor — the placement
   * and brief behind its artwork, so a request says what to print rather than
   * only showing a picture of it.
   */
  design?: ProductDesign
}

/**
 * A cart line as the shop shows it: what is stored, plus what it costs now
 * and whether it can still be ordered — both worked out against the live
 * catalogue, the way the server will.
 */
export interface CartLine extends CartItem {
  /** One of the line — one box, for a box line — with volume tiers applied. */
  unitPrice: number
  lineTotal: number
  /** Gone from the catalogue or taken out of sale: the server would refuse it. */
  unavailable: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether two boxes are the same thing to send: same ready-made box (or none),
 * same contents, same card and message, same designs and sticker logo. Only
 * then can a second one simply raise the first one's quantity.
 */
function sameBox(a: BoxDetails, b: BoxDetails): boolean {
  const key = (box: BoxDetails) =>
    JSON.stringify({
      bundleId: box.bundleId ?? null,
      parts: boxAllLines(box)
        .map((line) => `${line.productId}:${line.quantity}:${line.customizedImage ?? ''}`)
        .sort(),
      card: box.greetingCard?.productId ?? null,
      message: (box.greetingCard?.message ?? '').trim(),
      stickerLogo: box.stickerLogo?.url ?? null,
      packagingPrompt: box.packagingPrompt ?? null,
      campaignId: box.campaignId ?? null,
    })
  return key(a) === key(b)
}

/** A cart id of its own for a second, different copy of the same catalogue box. */
function variantId(productId: string): string {
  return `${productId}${CART_VARIANT_SEPARATOR}${crypto.randomUUID().slice(0, 8)}`
}

interface CartContextValue {
  items: CartLine[]
  addItem: (
    product: Product,
    quantity?: number,
    box?: BoxDetails,
    design?: ProductDesign,
  ) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  /**
   * Point an existing line at the product's current design, or at none.
   *
   * There is only ever one design per product per shopper — the editor keeps
   * exactly one, and `addItem` merges by product id, so a cart cannot hold two
   * versions of the same product to disagree about. Editing or removing a
   * design therefore has to reach the line already in the basket, or the
   * shopper would approve new artwork and still be sent the old.
   */
  setItemDesign: (productId: string, design: ProductDesign | null) => void
  /** Re-open a box from the cart, edit it, and write it back to the same line. */
  updateBoxItem: (itemId: string, product: Product, box: BoxDetails) => void
  clearCart: () => void
  itemCount: number
  subtotal: number
  /** Some line can no longer be ordered — checkout waits until it is removed. */
  hasUnavailable: boolean
}

/** Exported so signing out can forget it — see `AuthContext.logout`. */
export const CART_STORAGE_KEY = 'atelier-cart'
const STORAGE_KEY = CART_STORAGE_KEY

const CartContext = createContext<CartContextValue | null>(null)

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as CartItem[]
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loadCart())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  // Removals and quantity changes are tracked here, where every button that
  // makes one ends up; adding is tracked at the call sites, which know whether
  // it was a product, a ready-made box or a built one. Read through a ref so
  // the callbacks stay stable and the event goes out once, outside the state
  // updater (which StrictMode runs twice).
  const posthog = usePostHog()
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  const trackLine = useCallback(
    (event: string, productId: string, extra: Record<string, unknown> = {}) => {
      const item = itemsRef.current.find((i) => i.product.id === productId)
      if (!item) return
      posthog?.capture(event, {
        product_id: cartLineCatalogueId(item),
        product_name: item.product.name,
        product_sku: item.product.sku,
        price: item.product.price,
        currency: item.product.currency,
        is_box: Boolean(item.box),
        has_design: Boolean(item.design),
        previous_quantity: item.quantity,
        ...extra,
      })
    },
    [posthog],
  )

  // A cart item is a snapshot taken when it was added, so its images freeze at
  // that moment — an item added as a guest, or before the company's branded
  // images finished generating, would keep showing the plain catalog picture.
  // Re-read the live (company-scoped) products and refresh the image fields so
  // the customized variant is what every cart surface renders. Products listed
  // inside a box are snapshots too, so they're refreshed the same way.
  //
  // The same read prices every line (volume tiers, a ready-made box's own
  // price) and says which lines the server would refuse. Only catalogue ids
  // are asked for: a built box's own id is the builder's, and a second copy
  // of a ready-made box sits under an id of its own (see `addItem`).
  const catalogueIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of items) {
      if (!item.box) ids.add(baseProductId(item.product.id))
      else {
        if (item.box.bundleId) ids.add(item.box.bundleId)
        for (const line of boxAllLines(item.box)) ids.add(line.productId)
      }
    }
    return [...ids]
  }, [items])
  const storedIds = useMemo(() => catalogueIds.filter((id) => UUID.test(id)), [catalogueIds])
  const { data: liveProducts } = useProductsByIds(storedIds)

  // Held on to while a changed cart is looked up again, so prices and notices
  // do not flicker each time something is added. An id the current answer was
  // not asked about counts as not known yet rather than gone.
  const [live, setLive] = useState<LiveCatalogue | undefined>(undefined)
  const [seenLive, setSeenLive] = useState<Product[] | undefined>(undefined)
  if (liveProducts && liveProducts !== seenLive) {
    setSeenLive(liveProducts)
    setLive({
      products: new Map(liveProducts.map((p) => [p.id, p])),
      // Anything that is not a catalogue id was never going to be found, which
      // is what the server will make of it too.
      asked: new Set(catalogueIds),
    })
  }

  const hydratedItems = useMemo<CartLine[]>(() => {
    const byId = live?.products ?? new Map<string, Product>()

    const freshImages = (
      snapshot: { image: string; customizedImage: string | null },
      id: string | null | undefined,
    ) => {
      const fresh = id ? byId.get(id) : undefined
      if (
        !fresh ||
        (fresh.image === snapshot.image &&
          fresh.customizedImage === snapshot.customizedImage)
      ) {
        return null
      }
      return { image: fresh.image, customizedImage: fresh.customizedImage }
    }

    return items.map((item) => {
      // Images only — name and the rest stay as captured at add time. A
      // ready-made box added as one is refreshed from that box; one put
      // together in the builder keeps its own photo.
      const catalogueId = item.box
        ? isBoxSku(item.product.sku)
          ? null
          : item.box.bundleId
        : baseProductId(item.product.id)
      const productImages = freshImages(item.product, catalogueId)

      let box = item.box
      if (box) {
        let boxChanged = false
        const refresh = (line: BoxLine | null | undefined) => {
          // A line carrying the shopper's own design keeps it — refreshing from
          // the catalog would swap their artwork for stock.
          if (!line || line.customPrint) return line
          const images = freshImages(line, line.productId)
          if (!images) return line
          boxChanged = true
          // Only the base photo is refreshed. Pulling the catalogue's branded
          // variant in here would re-brand every product in the box behind the
          // shopper's back — the exact thing `BoxLine.customizedImage` exists
          // to prevent.
          return { ...line, image: images.image, customizedImage: null }
        }

        const lines = box.lines.map((line) => refresh(line)!)
        const packaging = refresh(box.packaging)
        const filling = refresh(box.filling)
        if (boxChanged) box = { ...box, lines, packaging, filling }
      }

      const product = productImages
        ? {
            ...item.product,
            ...productImages,
            images: catalogueId ? byId.get(catalogueId)?.images : item.product.images,
          }
        : item.product
      const price = cartLinePrice(item, live)
      return {
        ...item,
        product,
        box,
        unitPrice: price.unit,
        lineTotal: price.total,
        unavailable: cartLineUnavailable(item, live),
      }
    })
  }, [items, live])

  const addItem = useCallback(
    (product: Product, quantity = 1, box?: BoxDetails, design?: ProductDesign) => {
      setItems((prev) => {
        // The same thing again only raises its quantity. A box is the same
        // only when everything about it is — the same ready-made box with
        // another card message is a second line, or the message would be lost.
        const existing = prev.find((i) =>
          box
            ? Boolean(i.box) &&
              baseProductId(i.product.id) === product.id &&
              sameBox(i.box!, box)
            : !i.box && baseProductId(i.product.id) === product.id,
        )
        if (existing) {
          return prev.map((i) =>
            i === existing
              ? { ...i, quantity: Math.min(MAX_LINE_QUANTITY, i.quantity + quantity) }
              : i,
          )
        }
        // Lines are keyed by product id, so a second, different copy of the
        // same box gets one of its own. The server prices a box line from its
        // box (its bundle, or its parts), never from this id.
        const taken = prev.some((i) => i.product.id === product.id)
        const line = taken ? { ...product, id: variantId(product.id) } : product
        return [...prev, { product: line, quantity, box, design }]
      })
    },
    [],
  )

  const setItemDesign = useCallback(
    (productId: string, design: ProductDesign | null) => {
      setItems((prev) => {
        // A box line's artwork lives in the box, not here — leave it alone.
        const mine = (i: CartItem) => !i.box && baseProductId(i.product.id) === productId
        if (!prev.some(mine)) return prev
        return prev.map((i) =>
          mine(i)
            ? { ...i, design: design ?? undefined }
            : i,
        )
      })
    },
    [],
  )

  const removeItem = useCallback(
    (productId: string) => {
      trackLine('product removed from cart', productId)
      setItems((prev) => prev.filter((i) => i.product.id !== productId))
    },
    [trackLine],
  )

  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (quantity < 1) {
        trackLine('product removed from cart', productId)
        setItems((prev) => prev.filter((i) => i.product.id !== productId))
        return
      }
      const capped = Math.min(MAX_LINE_QUANTITY, quantity)
      trackLine('cart quantity changed', productId, { quantity: capped })
      setItems((prev) =>
        prev.map((i) =>
          i.product.id === productId ? { ...i, quantity: capped } : i,
        ),
      )
    },
    [trackLine],
  )

  // An edited box replaces its line in place: the id, the position and how many
  // of the box the shopper ordered all survive, only the contents change.
  const updateBoxItem = useCallback(
    (itemId: string, product: Product, box: BoxDetails) => {
      setItems((prev) =>
        prev.map((i) =>
          i.product.id === itemId ? { ...i, product, box } : i,
        ),
      )
    },
    [],
  )

  const clearCart = useCallback(() => setItems([]), [])

  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  )

  // What the lines come to, each priced the way the server will price it.
  const subtotal = useMemo(
    () => hydratedItems.reduce((sum, i) => sum + i.lineTotal, 0),
    [hydratedItems],
  )
  const hasUnavailable = useMemo(
    () => hydratedItems.some((i) => i.unavailable),
    [hydratedItems],
  )

  const value = useMemo(
    () => ({
      items: hydratedItems,
      addItem,
      removeItem,
      updateQuantity,
      setItemDesign,
      updateBoxItem,
      clearCart,
      itemCount,
      subtotal,
      hasUnavailable,
    }),
    [
      hydratedItems,
      addItem,
      removeItem,
      updateQuantity,
      setItemDesign,
      updateBoxItem,
      clearCart,
      itemCount,
      subtotal,
      hasUnavailable,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
