/**
 * A product's diet and sourcing badges (`products.labels`), from two sources:
 *
 * - Endeavour/JTL product tags — `vegan`, `organic`, `bio`.
 * - The "Snacks 2026" sheet's Properties column (F), saved as
 *   `src/data/snacks-2026.csv`: "Vegan", "Bio", comma-separated. Rows are
 *   matched to products by JFSKU only; a row without one is ignored.
 *
 * A product gets every label either source gives it. To refresh the sheet,
 * download it from Google Sheets as CSV (File → Download → CSV) over that
 * file — only the JFSKU, Product and Properties columns are read, so the full
 * export works too — then run `pnpm sync:labels` or a full `pnpm sync:endeavour`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProductLabel } from '../../src/db/schema/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const SHEET_CSV = path.join(__dirname, '../../src/data/snacks-2026.csv')

/** JTL tag names and sheet properties (lowercased) onto a badge. */
const LABEL_WORDS: Record<string, ProductLabel> = {
  vegan: 'vegan',
  organic: 'organic',
  bio: 'organic',
}

const labelOf = (word: string): ProductLabel | undefined =>
  LABEL_WORDS[word.trim().toLowerCase()]

/** Sorted and without repeats, so equal sets compare equal. */
export function mergeLabels(...lists: (readonly ProductLabel[] | undefined)[]): ProductLabel[] {
  return [...new Set(lists.flatMap((l) => l ?? []))].sort()
}

/** The badges an Endeavour record's own tags give it. */
export function labelsFromTags(
  productTags: { productCategoryTag?: { name?: string } }[] | undefined,
): ProductLabel[] {
  const labels: ProductLabel[] = []
  for (const tag of productTags ?? []) {
    const label = labelOf(tag.productCategoryTag?.name ?? '')
    if (label) labels.push(label)
  }
  return mergeLabels(labels)
}

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export interface SheetLabels {
  /** JFSKU → the badges its Properties give. */
  bySku: Map<string, ProductLabel[]>
  /** JFSKUs on several rows that disagree — left out until the sheet is fixed. */
  conflicts: string[]
  /** Rows with no JFSKU, which cannot be matched. */
  withoutSku: number
}

/** Read the sheet's Properties, keyed by JFSKU. A missing file is no labels. */
export function loadSheetLabels(file = SHEET_CSV): SheetLabels {
  let text: string
  try {
    text = readFileSync(file, 'utf-8').replace(/^﻿/, '')
  } catch {
    return { bySku: new Map(), conflicts: [], withoutSku: 0 }
  }
  const [header = [], ...rows] = parseCsv(text)
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name)
  const skuCol = col('jfsku')
  const propsCol = col('properties')
  if (skuCol < 0 || propsCol < 0) {
    throw new Error(`${path.basename(file)} needs "JFSKU" and "Properties" columns`)
  }

  const seen = new Map<string, string>()
  const bySku = new Map<string, ProductLabel[]>()
  const conflicts = new Set<string>()
  let withoutSku = 0
  for (const row of rows) {
    if (row.every((cell) => !cell.trim())) continue
    // The id leads the cell; a note sometimes follows it ("VZ9N… (Bild
    // abweichend)"), and a cell holding only a note has no id at all.
    const sku = (row[skuCol] ?? '').trim().match(/^[A-Z0-9]{6,20}\b/)?.[0]
    if (!sku) {
      withoutSku++
      continue
    }
    const labels = mergeLabels(
      (row[propsCol] ?? '')
        .split(',')
        .map(labelOf)
        .filter((l): l is ProductLabel => Boolean(l)),
    )
    const key = labels.join(',')
    const prior = seen.get(sku)
    if (prior !== undefined && prior !== key) conflicts.add(sku)
    seen.set(sku, key)
    bySku.set(sku, labels)
  }
  for (const sku of conflicts) bySku.delete(sku)
  return { bySku, conflicts: [...conflicts].sort(), withoutSku }
}
