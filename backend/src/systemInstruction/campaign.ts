/**
 * Instructions for the "Your Company Kit" campaign assembly:
 *   - copy generation (title + marketing description) from brand signals
 *   - the composite "kit" image showing all bundle products together, on-brand
 */

export interface CampaignBrandSignals {
  companyName: string
  description?: string | null
  industry?: string | null
  keywords?: string[]
  tagline?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
}

// ── Copy generation ─────────────────────────────────────────────────────────

export const CAMPAIGN_SYSTEM_INSTRUCTION =
  'You are a senior e-commerce marketing copywriter. Given a brand and a curated ' +
  'bundle of catalog products, write a single launch campaign. ' +
  'Return ONLY valid minified JSON: {"title": string, "description": string}. ' +
  'title: <= 60 characters, punchy, no surrounding quotes. ' +
  'description: 2-3 sentences (<= 320 characters) of on-brand marketing copy that ' +
  'ties the bundle to the brand. No markdown, no code fences, no preamble.'

export function buildCampaignUserPrompt(
  brand: CampaignBrandSignals,
  productNames: string[],
  brief?: string | null,
): string {
  const lines = [
    `Brand: ${brand.companyName}`,
    brand.tagline ? `Tagline: ${brand.tagline}` : null,
    brand.industry ? `Industry: ${brand.industry}` : null,
    brand.description ? `About: ${brand.description}` : null,
    brand.keywords?.length ? `Keywords: ${brand.keywords.join(', ')}` : null,
    brief?.trim()
      ? `Campaign brief from the user (follow this closely): ${brief.trim()}`
      : null,
    '',
    'Bundle products:',
    ...(productNames.length
      ? productNames.map((n) => `- ${n}`)
      : ['- (no products matched yet)']),
    '',
    'Write the campaign as JSON now.',
  ].filter((l) => l !== null)
  return lines.join('\n')
}

// ── Composite "kit" image ────────────────────────────────────────────────────

/**
 * One premium photograph featuring ALL the bundle products together — never a
 * grid/collage of separate frames. Each provided image is a product reference.
 */
export function buildCampaignKitImagePrompt(
  brand: CampaignBrandSignals,
  productNames: string[],
  hasLogo: boolean,
  brief?: string | null,
): string {
  const p: string[] = []

  p.push(
    'Act as an expert commercial product photographer and set stylist. Create ONE single, photorealistic marketing photograph that features ALL of the provided products together in one cohesive scene — an attractively arranged group shot or flat-lay, styled as a premium brand campaign / starter kit.',
  )

  if (brief?.trim()) {
    p.push(
      `Campaign brief / theme to reflect in the styling and mood: ${brief.trim()}.`,
    )
  }

  p.push(
    'Each provided image is a PRODUCT reference. Reproduce every product faithfully — its real shape, colour, material and proportions — and include all of them in the single composition. Do not omit, duplicate, or redesign any product.',
  )

  const palette = [brand.primaryColor, brand.secondaryColor]
    .filter(Boolean)
    .join(' and ')
  p.push(
    `Arrange the products with intentional, balanced composition, consistent soft lighting and realistic shadows, on a clean, premium background${
      palette ? ` that complements the brand colours (${palette})` : ''
    }. It should look like one professionally styled photo, not separate cut-outs pasted together.`,
  )

  if (hasLogo) {
    p.push(
      'The final provided image is the brand LOGO. Place it subtly and tastefully in the scene (for example on a small card, tag, or surface) so the set reads as this brand. It is the ONLY brand allowed — do not show any other or made-up logos, brand names or text.',
    )
  }

  if (productNames.length) {
    p.push(`The products are: ${productNames.join(', ')}.`)
  }

  p.push(
    'The final image must be a horizontal landscape photograph (3:2, wider than it is tall), composed as a banner-style hero suited to that wide frame.',
  )

  p.push(
    'Produce exactly ONE unified photograph. Do NOT make a grid, collage, contact sheet, mosaic, or separate labelled panels. The result should feel like premium commercial photography, not a generic AI image or a flat mockup.',
  )

  return p.join('\n\n')
}
