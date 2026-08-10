import OpenAI from "openai";
import {
  SYSTEM_INSTRUCTION,
  buildBrandExtractionUserPrompt,
} from "../systemInstruction/brandExtraction.js";
import { openaiBrandJsonSchema } from "./openaiBrandSchema.js";
import { parseBrandResponse } from "./parseBrandResponse.js";
import { resolveInstruction } from "../modules/system-instructions/system-instructions.service.js";
import type { BrandData } from "./types.js";

export async function extractBrandDataOpenAI(
  html: string,
  pageUrl: string,
  apiKey: string,
  model: string
): Promise<BrandData> {
  const client = new OpenAI({ apiKey });
  // Super-admin override for the system instruction; built-in is the fallback.
  const system =
    (await resolveInstruction("brand-extraction")) ?? SYSTEM_INSTRUCTION;
  const prompt = buildBrandExtractionUserPrompt(pageUrl, html);

  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "brand_data",
        strict: true,
        schema: openaiBrandJsonSchema,
      },
    },
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return parseBrandResponse(text, "OpenAI");
}
