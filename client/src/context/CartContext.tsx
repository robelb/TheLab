import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useProductsByIds } from '@/hooks/use-products'
import { boxAllLines } from '@/lib/box'
import type { BoxDetails, BoxLine } from '@/types/box'
import type { Product } from '@/types/product'

export interface CartItem {
  product: Product
  quantity: number
  /** Present when the line is a built gift box — the products inside it. */
  box?: BoxDetails
}

interface CartContextValue {
  items: CartItem[]
  addItem: (product: Product, quantity?: number, box?: BoxDetails) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  /** Re-open a box from the cart, edit it, and write it back to the same line. */
  updateBoxItem: (itemId: string, product: Product, box: BoxDetails) => void
  clearCart: () => void
  itemCount: number
  subtotal: number
}

const STORAGE_KEY = 'atelier-cart'

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

  // A cart item is a snapshot taken when it was added, so its images freeze at
  // that moment — an item added as a guest, or before the company's branded
  // images finished generating, would keep showing the plain catalog picture.
  // Re-read the live (company-scoped) products and refresh the image fields so
  // the customized variant is what every cart surface renders. Products listed
  // inside a box are snapshots too, so they're refreshed the same way.
  const storedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of items) {
      ids.add(item.product.id)
      if (item.box) for (const line of boxAllLines(item.box)) ids.add(line.productId)
    }
    return [...ids]
  }, [items])
  const { data: liveProducts } = useProductsByIds(storedIds)

  const hydratedItems = useMemo(() => {
    if (!liveProducts?.length) return items
    const byId = new Map(liveProducts.map((p) => [p.id, p]))

    const freshImages = (
      snapshot: { image: string; customizedImage: string | null },
      id: string,
    ) => {
      const live = byId.get(id)
      if (
        !live ||
        (live.image === snapshot.image &&
          live.customizedImage === snapshot.customizedImage)
      ) {
        return null
      }
      return { image: live.image, customizedImage: live.customizedImage }
    }

    let changed = false
    const next = items.map((item) => {
      // Images only — price, name and the rest stay as captured at add time.
      const productImages = freshImages(item.product, item.product.id)

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

      if (!productImages && box === item.box) return item
      changed = true
      return {
        ...item,
        product: productImages
          ? {
              ...item.product,
              ...productImages,
              images: byId.get(item.product.id)?.images,
            }
          : item.product,
        box,
      }
    })

    return changed ? next : items
  }, [items, liveProducts])

  const addItem = useCallback(
    (product: Product, quantity = 1, box?: BoxDetails) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.product.id === product.id)
        if (existing) {
          return prev.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + quantity }
              : i,
          )
        }
        return [...prev, { product, quantity, box }]
      })
    },
    [],
  )

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId))
  }, [])

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity < 1) {
      setItems((prev) => prev.filter((i) => i.product.id !== productId))
      return
    }
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, quantity } : i,
      ),
    )
  }, [])

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

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
    [items],
  )

  const value = useMemo(
    () => ({
      items: hydratedItems,
      addItem,
      removeItem,
      updateQuantity,
      updateBoxItem,
      clearCart,
      itemCount,
      subtotal,
    }),
    [
      hydratedItems,
      addItem,
      removeItem,
      updateQuantity,
      updateBoxItem,
      clearCart,
      itemCount,
      subtotal,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
