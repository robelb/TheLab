import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import {
  missingLlmConfigMessage,
  resolveLlmConfig,
} from '../../extractor/llmConfig.js'
import {
  CAMPAIGN_SYSTEM_INSTRUCTION,
  buildCampaignUserPrompt,
  type CampaignBrandSignals,
} from '../../systemInstruction/campaign.js'

export interface CampaignCopy {
  title: string
  description: string
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
}

/** Deterministic copy used when the model is unavailable or returns junk. */
export function fallbackCampaignCopy(
  brand: CampaignBrandSignals,
): CampaignCopy {
  return {
    title: `${brand.companyName} — Featured Collection`,
    description:
      brand.description?.trim() ||
      'A curated selection of products picked to match your brand.',
  }
}

/** Parse the model's JSON, falling back to deterministic copy on any failure. */
function parseCopy(raw: string, brand: CampaignBrandSignals): CampaignCopy {
  try {
    const obj = JSON.parse(stripFences(raw)) as Partial<CampaignCopy>
    if (obj.title && obj.description) {
      return {
        title: String(obj.title).slice(0, 80),
        description: String(obj.description),
      }
    }
  } catch {
    // fall through to fallback
  }
  return fallbackCampaignCopy(brand)
}

async function genOpenAI(
  user: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const client = new OpenAI({ apiKey })
  const res = await client.chat.completions.create({
    model,
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: CAMPAIGN_SYSTEM_INSTRUCTION },
      { role: 'user', content: user },
    ],
  })
  return res.choices[0]?.message?.content ?? ''
}

async function genGemini(
  user: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: user }] }],
    config: {
      systemInstruction: CAMPAIGN_SYSTEM_INSTRUCTION,
      temperature: 0.7,
      responseMimeType: 'application/json',
    },
  })
  return res.text ?? ''
}

/** Generate a campaign title + marketing copy from brand signals + bundle. */
export async function generateCampaignCopy(
  brand: CampaignBrandSignals,
  productNames: string[],
  brief?: string | null,
): Promise<CampaignCopy> {
  const llm = resolveLlmConfig()
  if (!llm) throw new Error(missingLlmConfigMessage())

  const user = buildCampaignUserPrompt(brand, productNames, brief)
  const raw =
    llm.provider === 'openai'
      ? await genOpenAI(user, llm.apiKey, llm.model)
      : await genGemini(user, llm.apiKey, llm.model)

  return parseCopy(raw, brand)
}
