#!/usr/bin/env node
/**
 * Populate each product's dominant color for brand-color similarity filtering.
 *
 * For every product we try to extract a real dominant color from its image
 * (downscaled, ignoring near-white/black/gray background pixels). If the image
 * can't be fetched or has no colorful pixels, we fall back to a deterministic
 * MOCK color derived from the SKU — so every product always gets a stable,
 * distinct color and the demo works even offline.
 *
 * Usage:
 *   pnpm colors                # fill products missing a color
 *   pnpm colors -- --all       # recompute for every product
 *   pnpm colors -- --mock      # skip image fetch, use mock palette only
 */
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

import sharp from 'sharp'
import { eq, isNull } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { products } from '../src/db/schema/index.js'
import { rgbToHex, rgbToLab, type Rgb } from '../src/lib/color.js'

// Distinct, saturated palette for the mock fallback (spread around the wheel).
const MOCK_PALETTE = [
  '#c0392b', '#e74c3c', '#e67e22', '#f39c12', '#f1c40f', '#2ecc71',
  '#27ae60', '#16a085', '#1abc9c', '#2980b9', '#3498db', '#34495e',
  '#8e44ad', '#9b59b6', '#d35400', '#e84393', '#00b894', '#0984e3',
  '#6c5ce7', '#fd79a8',
]

function mockColorFor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return MOCK_PALETTE[hash % MOCK_PALETTE.length]
}

function parseArgs(argv: string[]) {
  return {
    all: argv.includes('--all'),
    mockOnly: argv.includes('--mock'),
  }
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Downscale and average the "colorful" pixels — skipping near-white/black and
 * low-saturation (gray) pixels so a product shot on a white studio background
 * yields the product's color, not the backdrop. Falls back to the plain average
 * when nothing colorful is found.
 */
async function dominantColorFromImage(buffer: Buffer): Promise<Rgb | null> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(28, 28, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const ch = info.channels
    let cr = 0, cg = 0, cb = 0, cn = 0 // colorful accumulator
    let ar = 0, ag = 0, ab = 0, an = 0 // overall accumulator

    for (let i = 0; i + 2 < data.length; i += ch) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      ar += r; ag += g; ab += b; an++

      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const sat = max === 0 ? 0 : (max - min) / max
      if (max > 240 || max < 18 || sat < 0.12) continue // background / gray
      cr += r; cg += g; cb += b; cn++
    }

    if (cn >= 3) return { r: cr / cn, g: cg / cn, b: cb / cn }
    if (an > 0) return { r: ar / an, g: ag / an, b: ab / an }
    return null
  } catch {
    return null
  }
}

async function main() {
  const { all, mockOnly } = parseArgs(process.argv.slice(2))

  const rows = await db
    .select({ id: products.id, sku: products.sku, image: products.image })
    .from(products)
    .where(all ? undefined : isNull(products.dominantColor))

  console.log(
    `[colors] ${rows.length} product(s) to process ${
      mockOnly ? '(mock only)' : '(image → mock fallback)'
    }`,
  )

  let real = 0
  let mock = 0
  const CONCURRENCY = 8

  for (let start = 0; start < rows.length; start += CONCURRENCY) {
    const batch = rows.slice(start, start + CONCURRENCY)
    await Promise.all(
      batch.map(async (p) => {
        let rgb: Rgb | null = null
        if (!mockOnly && p.image) {
          const buf = await fetchImageBuffer(p.image)
          if (buf) rgb = await dominantColorFromImage(buf)
        }

        let hex: string
        if (rgb) {
          hex = rgbToHex(rgb.r, rgb.g, rgb.b)
          real++
        } else {
          hex = mockColorFor(p.sku || p.id)
          const m = hex.slice(1)
          const int = parseInt(m, 16)
          rgb = { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
          mock++
        }

        const lab = rgbToLab(rgb.r, rgb.g, rgb.b)
        await db
          .update(products)
          .set({
            dominantColor: hex,
            colorL: lab.l,
            colorA: lab.a,
            colorB: lab.b,
          })
          .where(eq(products.id, p.id))
      }),
    )
    console.log(`[colors] ${Math.min(start + CONCURRENCY, rows.length)}/${rows.length}`)
  }

  console.log(`[colors] done — ${real} from image, ${mock} from mock palette`)
  process.exit(0)
}

main().catch((err) => {
  console.error('[colors] failed:', err)
  process.exit(1)
})
