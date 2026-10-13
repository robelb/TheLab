import { GoogleGenAI } from '@google/genai'
import { env } from '../config/env.js'

const EMBEDDING_MODEL = 'gemini-embedding-001'
const DIMENSIONS = 768

let aiClient: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!aiClient) {
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for embeddings')
    }
    aiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  }
  return aiClient
}

export async function embedText(text: string): Promise<number[]> {
  const ai = getClient()
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [text],
    config: { outputDimensionality: DIMENSIONS },
  })

  const values = response.embeddings?.[0]?.values
  if (!values) throw new Error('Embedding returned no values')
  return values
}

/**
 * A shopper's search text as an embedding, remembered for a while.
 *
 * Every search — and every further page of the same search — used to be a
 * paid call. The same few queries come up again and again, so the last few
 * hundred are kept in memory for an hour.
 */
const QUERY_CACHE_SIZE = 500
const QUERY_CACHE_MS = 60 * 60_000
const queryCache = new Map<string, { at: number; values: number[] }>()

export async function embedQuery(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase()
  const hit = queryCache.get(key)
  if (hit && Date.now() - hit.at < QUERY_CACHE_MS) {
    // Re-inserted so the map's order stays least-recently-used first.
    queryCache.delete(key)
    queryCache.set(key, hit)
    return hit.values
  }
  const values = await embedText(text)
  queryCache.set(key, { at: Date.now(), values })
  if (queryCache.size > QUERY_CACHE_SIZE) {
    queryCache.delete(queryCache.keys().next().value!)
  }
  return values
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const ai = getClient()
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: { outputDimensionality: DIMENSIONS },
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
