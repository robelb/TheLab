import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CatalogProduct {
  id: string
  sourceId: string
  variantId: string | null
  sku: string
  name: string
  tagline: string
  price: number
  currency: string
  stock: number
  category: string
  categorySlug: string
  image: string
  description: string
  details: string[]
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const catalogPath = path.join(__dirname, 'normalizedProducts.json')

const raw = readFileSync(catalogPath, 'utf-8')
export const catalogProducts: CatalogProduct[] = JSON.parse(raw) as CatalogProduct[]

export const catalogCategories = [
  ...new Set(catalogProducts.map((p) => p.category)),
].sort((a, b) => a.localeCompare(b))

const byId = new Map(catalogProducts.map((p) => [p.id, p]))

export function getCatalogProduct(id: string): CatalogProduct | undefined {
  return byId.get(id)
}

export function getCatalogPriceBounds(): { min: number; max: number } {
  const prices = catalogProducts.map((p) => p.price)
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  }
}

export function filterCatalogProducts(
  category?: string,
  query?: string,
  minPrice?: number,
  maxPrice?: number,
): CatalogProduct[] {
  let list = catalogProducts

  if (category && category !== 'all') {
    const slug = category.toLowerCase()
    list = list.filter(
      (p) =>
        p.categorySlug === slug ||
        p.category.toLowerCase() === slug ||
        p.category === category,
    )
  }

  const q = query?.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    )
  }

  if (minPrice !== undefined) {
    list = list.filter((p) => p.price >= minPrice)
  }

  if (maxPrice !== undefined) {
    list = list.filter((p) => p.price <= maxPrice)
  }

  return list
}
