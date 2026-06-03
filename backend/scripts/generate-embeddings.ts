#!/usr/bin/env node
/**
 * Generate embeddings for all products using Gemini gemini-embedding-001.
 *
 * Usage:
 *   pnpm embed                     # embed products missing embeddings
 *   pnpm embed -- --all            # re-embed all products (force)
 *   pnpm embed -- --batch-size 20  # custom batch size (default: 50)
 */
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

import { neon } from '@neondatabase/serverless'
import { GoogleGenAI } from '@google/genai'
import { eq, isNull } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { categories, products } from '../src/db/schema/index.js'

const rawSql = neon(process.env.DATABASE_URL!)

const EMBEDDING_MODEL = 'gemini-embedding-001'
const DEFAULT_BATCH_SIZE = 10

interface ProductRow {
  id: string
  name: string
  tagline: string
  description: string
  details: string[] | null
  categoryName: string
}

function buildEmbeddingText(p: ProductRow): string {
  const parts = [p.name, p.tagline, p.categoryName, p.description]
  if (p.details?.length) {
    parts.push(p.details.join('. '))
  }
  return parts.filter(Boolean).join(' — ')
}

function parseArgs(argv: string[]) {
  let all = false
  let batchSize = DEFAULT_BATCH_SIZE

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') all = true
    if (argv[i] === '--batch-size' && argv[i + 1]) {
      batchSize = Math.max(1, parseInt(argv[++i], 10) || DEFAULT_BATCH_SIZE)
    }
  }

  return { all, batchSize }
}

async function fetchProducts(all: boolean): Promise<ProductRow[]> {
  const baseQuery = db
    .select({
      id: products.id,
      name: products.name,
      tagline: products.tagline,
      description: products.description,
      details: products.details,
      categoryName: categories.name,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))

  if (all) {
    return baseQuery
  }

  return baseQuery.where(isNull(products.embedding))
}

async function embedBatch(
  ai: GoogleGenAI,
  texts: string[],
): Promise<number[][]> {
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: { outputDimensionality: 768 },
  })

  const embeddings = response.embeddings
  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error(
      `Expected ${texts.length} embeddings, got ${embeddings?.length ?? 0}`,
    )
  }

  return embeddings.map((e) => {
    if (!e.values) throw new Error('Embedding has no values')
    return e.values
  })
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    console.error('GEMINI_API_KEY is required in .env')
    process.exit(1)
  }

  const { all, batchSize } = parseArgs(process.argv.slice(2))
  const ai = new GoogleGenAI({ apiKey })

  console.log(`Fetching products${all ? ' (all)' : ' (missing embeddings)'}...`)
  const rows = await fetchProducts(all)

  if (rows.length === 0) {
    console.log('All products already have embeddings. Use --all to re-embed.')
    return
  }

  console.log(`${rows.length} products to embed (batch size: ${batchSize})`)

  let processed = 0
  const totalBatches = Math.ceil(rows.length / batchSize)

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    const texts = batch.map(buildEmbeddingText)

    console.log(
      `Batch ${batchNum}/${totalBatches} — embedding ${batch.length} products...`,
    )

    const vectors = await embedBatch(ai, texts)
    const now = new Date()

    for (let j = 0; j < batch.length; j++) {
      const vectorStr = `[${vectors[j].join(',')}]`
      await rawSql`
        UPDATE products
        SET embedding = ${vectorStr}::vector,
            embedding_updated_at = ${now.toISOString()}::timestamptz,
            updated_at = ${now.toISOString()}::timestamptz
        WHERE id = ${batch[j].id}::uuid
      `
    }

    processed += batch.length
    console.log(`  ✓ ${processed}/${rows.length} done`)
  }

  console.log(`\nEmbedding complete. ${processed} products updated.`)
}

main().catch((err) => {
  console.error('Embedding failed:', err)
  process.exit(1)
})
