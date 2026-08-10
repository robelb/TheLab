import { GoogleGenAI } from "@google/genai";
import {
  SYSTEM_INSTRUCTION,
  buildBrandExtractionUserPrompt,
} from "../systemInstruction/brandExtraction.js";
import { geminiResponseSchema } from "./geminiSchema.js";
import { parseBrandResponse } from "./parseBrandResponse.js";
import { resolveInstruction } from "../modules/system-instructions/system-instructions.service.js";
import type { BrandData } from "./types.js";

export async function extractBrandDataGemini(
  html: string,
  pageUrl: string,
  apiKey: string,
  model: string
): Promise<BrandData> {
  const ai = new GoogleGenAI({ apiKey });
  // Super-admin override for the system instruction; built-in is the fallback.
  const system =
    (await resolveInstruction("brand-extraction")) ?? SYSTEM_INSTRUCTION;
  const prompt = buildBrandExtractionUserPrompt(pageUrl, html);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseSchema: geminiResponseSchema,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return parseBrandResponse(text, "Gemini");
}
