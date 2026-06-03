import OpenAI from "openai";
import { SYSTEM_INSTRUCTION } from "./brandPrompt.js";
import { openaiBrandJsonSchema } from "./openaiBrandSchema.js";
import { parseBrandResponse } from "./parseBrandResponse.js";
import type { BrandData } from "./types.js";

export async function extractBrandDataOpenAI(
  html: string,
  pageUrl: string,
  apiKey: string,
  model: string
): Promise<BrandData> {
  const client = new OpenAI({ apiKey });
  const prompt = `Source URL: ${pageUrl}\n\nHTML:\n${html}`;

  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTION },
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
