import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyPinnedProductOrder,
  PINNED_PRODUCT_IDS,
  patchCatalogCustomizedImages,
  type CatalogProduct,
} from '../data/catalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const catalogJsonPath = path.join(__dirname, '../data/normalizedProducts.json')
const catalogTsPath = path.join(__dirname, '../data/normalizedProducts.ts')

export function customizedImagePublicUrl(
  productId: string,
  baseUrl = process.env.PUBLIC_API_URL?.trim() || 'http://localhost:3001',
  version?: number | string,
): string {
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const imagePath = `${normalizedBase}/api/customized/${productId}.png`
  if (version === undefined) return imagePath
  return `${imagePath}?v=${version}`
}

/** Clear featured slots before regenerating for a new brand (always replace, never skip). */
export function clearFeaturedCustomizedImages(): void {
  const clears = Object.fromEntries(
    PINNED_PRODUCT_IDS.map((id) => [id, null]),
  ) as Record<string, null>
  syncCatalogCustomizedImages(clears)
}

export function updateCatalogCustomizedImages(
  updates: Record<string, string | null>,
): void {
  syncCatalogCustomizedImages(updates)
}

function syncCatalogCustomizedImages(
  updates: Record<string, string | null>,
): void {
  const products = JSON.parse(
    readFileSync(catalogJsonPath, 'utf-8'),
  ) as CatalogProduct[]

  for (const product of products) {
    if (product.id in updates) {
      product.customizedImage = updates[product.id]
    }
  }

  const ordered = applyPinnedProductOrder(
    products.map((p) => ({
      ...p,
      customizedImage: p.customizedImage ?? null,
    })),
  )

  writeFileSync(
    catalogJsonPath,
    `${JSON.stringify(ordered, null, 2)}\n`,
    'utf-8',
  )

  patchCatalogCustomizedImages(updates)

  const tsInterface = `/** Auto-generated — synced from normalizedProducts.json */
export interface NormalizedProduct {
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
  customizedImage: string | null
  description: string
  details: string[]
}

export const normalizedProducts: NormalizedProduct[] = ${JSON.stringify(ordered, null, 2)}
`

  writeFileSync(catalogTsPath, tsInterface, 'utf-8')
}
