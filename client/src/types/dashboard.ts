export interface Category {
  id: string
  name: string
  slug: string
  /** Box-building supplies (packaging, filling) — never listed in the shop. */
  isSupply?: boolean
}

/**
 * Requests this company has sent — the only per-company figures on the
 * dashboard. Everything else describes the shared house catalogue.
 */
export interface RequestStats {
  total: number
  new: number
  quoted: number
  confirmed: number
  /** Value of everything not cancelled. */
  openValue: number
  currency: string
  recent: {
    id: string
    reference: string
    status: string
    contactName: string
    total: number
    currency: string
    neededBy: string | null
    createdAt: string
  }[]
}

export interface DashboardStats {
  requests: RequestStats
  totals: {
    products: number
    categories: number
    featured: number
    outOfStock: number
    lowStock: number
    totalStock: number
    inventoryValue: number
  }
  priceRange: { min: number; max: number; avg: number }
  categoryBreakdown: { name: string; slug: string; count: number }[]
  recentProducts: {
    id: string
    name: string
    sku: string
    price: number
    currency: string
    stock: number
    image: string
    category: string
    createdAt: string
  }[]
}

/** Payload for creating/updating a product via the dashboard. */
/** One line of a pre-configured box's parts list, as the editor sends it. */
export interface ProductComponentInput {
  componentId: string
  quantity: number
  role: 'item' | 'packaging' | 'filling'
  sortOrder?: number
}

export interface ProductInput {
  name: string
  tagline: string
  price: number
  currency: string
  stock: number
  categoryId: string
  image: string
  images: string[]
  description: string
  details: string[]
  isFeatured: boolean
  sku?: string
  /** `bundle` is a pre-configured box sold at a price of its own. */
  kind?: 'single' | 'bundle'
  /** Occasion slugs a landing page can filter by, e.g. `christmas`. */
  tags?: string[]
  /** Smallest order the supplier accepts. */
  minQuantity?: number
  /** What a bundle holds. Sent only for a bundle; replaces the list wholesale. */
  components?: ProductComponentInput[]
}
