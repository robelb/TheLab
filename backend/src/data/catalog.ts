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
  /** Brand-customized product image; null until set for featured products. */
  customizedImage: string | null
  description: string
  details: string[]
}

/** First two slots are reserved for later customization work. */
export const PINNED_PRODUCT_IDS = ['mo9518-13', 'mo9243-03'] as const

type CatalogProductInput = Omit<CatalogProduct, 'customizedImage'> & {
  customizedImage?: string | null
}

function hydrateProduct(raw: CatalogProductInput): CatalogProduct {
  return {
    ...raw,
    customizedImage: raw.customizedImage ?? null,
  }
}

/** Keep mo9518-13 first and mo9243-03 second whenever they appear in a list. */
export function applyPinnedProductOrder(
  products: CatalogProduct[],
): CatalogProduct[] {
  const first = products.find((p) => p.id === PINNED_PRODUCT_IDS[0])
  const second = products.find((p) => p.id === PINNED_PRODUCT_IDS[1])
  if (!first && !second) return products

  const rest = products.filter(
    (p) => p.id !== PINNED_PRODUCT_IDS[0] && p.id !== PINNED_PRODUCT_IDS[1],
  )
  const head: CatalogProduct[] = []
  if (first) head.push(first)
  if (second) head.push(second)
  return [...head, ...rest]
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const catalogPath = path.join(__dirname, 'normalizedProducts.json')

function readCatalogFromDisk(): CatalogProduct[] {
  const raw = readFileSync(catalogPath, 'utf-8')
  const parsed = JSON.parse(raw) as CatalogProductInput[]
  return applyPinnedProductOrder(parsed.map(hydrateProduct))
}

let catalogProducts = readCatalogFromDisk()
let catalogCategories = [
  ...new Set(catalogProducts.map((p) => p.category)),
].sort((a, b) => a.localeCompare(b))
let byId = new Map(catalogProducts.map((p) => [p.id, p]))

/** Patch customizedImage URLs in the in-memory catalog (no full reload). */
export function patchCatalogCustomizedImages(
  updates: Record<string, string | null>,
): void {
  for (const product of catalogProducts) {
    if (product.id in updates) {
      const url = updates[product.id]
      product.customizedImage = url
      byId.get(product.id)!.customizedImage = url
    }
  }
}

/** Reload catalog from disk (after customized images are written). */
export function reloadCatalog(): void {
  catalogProducts = readCatalogFromDisk()
  catalogCategories = [
    ...new Set(catalogProducts.map((p) => p.category)),
  ].sort((a, b) => a.localeCompare(b))
  byId = new Map(catalogProducts.map((p) => [p.id, p]))
}

export function getCatalogCategories(): string[] {
  return catalogCategories
}

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

  return applyPinnedProductOrder(list)
}
