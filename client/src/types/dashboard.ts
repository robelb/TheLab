export interface Category {
  id: string
  name: string
  slug: string
}

export interface DashboardStats {
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
}
