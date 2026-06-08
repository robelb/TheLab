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
