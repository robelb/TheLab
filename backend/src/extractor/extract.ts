import { extractBrandDataGemini } from "./extractGemini.js";
import { extractBrandDataOpenAI } from "./extractOpenai.js";
import type { LlmConfig } from "./llmConfig.js";
import type { BrandData } from "./types.js";

export async function extractBrandData(
  html: string,
  pageUrl: string,
  config: LlmConfig
): Promise<BrandData> {
  if (config.provider === "openai") {
    return extractBrandDataOpenAI(html, pageUrl, config.apiKey, config.model);
  }
  return extractBrandDataGemini(html, pageUrl, config.apiKey, config.model);
}
