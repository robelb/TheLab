/**
 * System instruction + prompt builder for parsing a free-text shopper search
 * query into a price constraint plus the residual semantic text.
 *
 * Only PRICE is extracted as a hard filter — it's the one constraint embeddings
 * can't enforce. Everything else (product type, color, category words) stays in
 * `cleanedQuery` so it keeps contributing to semantic + keyword matching.
 */
export const QUERY_PARSE_SYSTEM_INSTRUCTION =
  'You are a search query parser for an e-commerce catalog. ' +
  'Given a shopper\'s free-text query, extract any PRICE constraint and return ' +
  'STRICT JSON only — no prose, no markdown.\n\n' +
  'Return an object with exactly these keys:\n' +
  '- "cleanedQuery": string. The query with ONLY the price phrase removed, ' +
  'keeping every other word (product type, color, material, style, category ' +
  'words like "sports"). If nothing meaningful remains, use an empty string.\n' +
  '- "minPrice": number or null. A lower price bound if expressed ("over", ' +
  '"above", "from", "at least", "min", or the low end of a range).\n' +
  '- "maxPrice": number or null. An upper price bound ("max", "under", "below", ' +
  '"less than", "up to", "cheaper than", "no more than", or the high end of a range).\n\n' +
  'Price rules: interpret currency symbols and words (€, eur, euro, $) as the same ' +
  'numeric amount; "between X and Y" sets minPrice=X and maxPrice=Y; output bare ' +
  'numbers (no currency). If no price is mentioned, both bounds are null and ' +
  'cleanedQuery equals the original query.'

/** Build the user-turn prompt for price extraction. */
export function buildQueryParseUserPrompt(query: string): string {
  return `Shopper query: """${query}"""\n\nReturn the JSON object now.`
}
