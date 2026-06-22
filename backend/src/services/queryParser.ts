import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { z } from 'zod'
import { resolveLlmConfig } from '../extractor/llmConfig.js'
import {
  QUERY_PARSE_SYSTEM_INSTRUCTION,
  buildQueryParseUserPrompt,
} from '../systemInstruction/queryParse.js'

/**
 * Price constraint extracted from a free-text search query, plus the residual
 * semantic text. Only price is a hard filter; category/color stay in the text.
 */
export interface ParsedQuery {
  cleanedQuery: string
  minPrice?: number
  maxPrice?: number
}

// Tolerant schema: the model may emit null or omit fields. We normalize after.
const rawParsedSchema = z.object({
  cleanedQuery: z.string().optional().nullable(),
  minPrice: z.coerce.number().min(0).optional().nullable(),
  maxPrice: z.coerce.number().min(0).optional().nullable(),
})

/**
 * Cheap gate: only worth an LLM call when the query plausibly carries a price
 * bound — a digit, a currency token, or a comparison word. Queries with no
 * price signal search as-is (the embedding already handles type/color/category).
 */
export function hasParseSignals(query: string): boolean {
  const q = query.trim()
  if (!q) return false

  if (/\d/.test(q)) return true
  if (/[€$]|\b(eur|euro|euros|usd|dollars?)\b/i.test(q)) return true
  if (
    /\b(max|maximum|min|minimum|under|over|below|above|less|more|cheaper|cheap|between|up\s+to|from|at\s+least|no\s+more)\b/i.test(
      q,
    )
  ) {
    return true
  }

  return false
}

function normalize(raw: z.infer<typeof rawParsedSchema>): ParsedQuery {
  const result: ParsedQuery = {
    cleanedQuery: (raw.cleanedQuery ?? '').trim(),
  }

  if (raw.minPrice != null) result.minPrice = raw.minPrice
  if (raw.maxPrice != null) result.maxPrice = raw.maxPrice

  // Drop an inverted price range rather than return zero results.
  if (
    result.minPrice !== undefined &&
    result.maxPrice !== undefined &&
    result.minPrice > result.maxPrice
  ) {
    delete result.minPrice
    delete result.maxPrice
  }

  return result
}

async function callOpenAI(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const client = new OpenAI({ apiKey })
  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: 'system', content: QUERY_PARSE_SYSTEM_INSTRUCTION },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('OpenAI returned an empty query-parse response.')
  return text
}

async function callGemini(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: QUERY_PARSE_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      temperature: 0,
    },
  })

  const text = response.text
  if (!text) throw new Error('Gemini returned an empty query-parse response.')
  return text
}

/**
 * Parse a free-text search query into a price constraint using the configured
 * LLM. Returns null when there are no AI credentials or the query carries no
 * price signal — callers fall back to searching the raw query.
 * Never throws: parse/validation failures resolve to null.
 */
export async function parseSearchQuery(
  query: string,
): Promise<ParsedQuery | null> {
  if (!hasParseSignals(query)) return null

  const llm = resolveLlmConfig()
  if (!llm) return null

  try {
    const prompt = buildQueryParseUserPrompt(query)
    const text =
      llm.provider === 'openai'
        ? await callOpenAI(prompt, llm.apiKey, llm.model)
        : await callGemini(prompt, llm.apiKey, llm.model)

    return normalize(rawParsedSchema.parse(JSON.parse(text)))
  } catch (err) {
    console.warn(
      '[search] query parse failed, falling back to raw query:',
      (err as Error).message,
    )
    return null
  }
}
