import { normalizeBrandColors } from "./normalizeColors.js";
import type { BrandData } from "./types.js";

export function parseBrandResponse(text: string, providerLabel: string): BrandData {
  let parsed: BrandData;
  try {
    parsed = JSON.parse(text) as BrandData;
  } catch (err) {
    throw new Error(
      `Failed to parse ${providerLabel} JSON response: ${(err as Error).message}\nRaw: ${text.slice(
        0,
        500
      )}`
    );
  }

  parsed.otherColors ??= [];
  parsed.fonts ??= [];
  parsed.navLinks ??= [];
  parsed.ctas ??= [];
  parsed.socialLinks ??= [];
  parsed.keywords ??= [];
  return normalizeBrandColors(parsed);
}
