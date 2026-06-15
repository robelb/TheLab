import { GoogleGenAI } from "@google/genai";
import {
  SYSTEM_INSTRUCTION,
  buildBrandExtractionUserPrompt,
} from "../systemInstruction/brandExtraction.js";
import { geminiResponseSchema } from "./geminiSchema.js";
import { parseBrandResponse } from "./parseBrandResponse.js";
import type { BrandData } from "./types.js";

export async function extractBrandDataGemini(
  html: string,
  pageUrl: string,
  apiKey: string,
  model: string
): Promise<BrandData> {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildBrandExtractionUserPrompt(pageUrl, html);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
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
