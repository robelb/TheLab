/**
 * Instructions for the "Your Company Kit" campaign assembly:
 *   - copy generation (title + marketing description) from brand signals
 *   - the composite "kit" image showing all bundle products together
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

export interface CampaignKitImageOptions {
  /** A brand logo is supplied as the LAST reference image, after the products. */
  hasLogo?: boolean
  companyName?: string | null
}

/**
 * The bundle image has a FIXED visual style — an overhead flat-lay of the whole
 * bundle packed into an open kraft gift box. The scene itself is brand-neutral
 * (white background, no brief-driven styling) so every campaign image is
 * consistent and a regeneration after a bundle change produces the same look
 * with a different product set. The brand appears only where it would in real
 * corporate gifting: as the company logo applied to each product.
 *
 * Images are provided as product references in the same order as `productNames`,
 * optionally followed by one brand logo image (`options.hasLogo`).
 */
export function buildCampaignKitImagePrompt(
  productNames: string[],
  options: CampaignKitImageOptions = {},
): string {
  const count = productNames.length
  const brand = options.companyName?.trim()

  const p: string[] = []

  p.push(
    'Act as an expert commercial product photographer. Create ONE single, photorealistic top-down (90° overhead) flat-lay product photograph of a gift box set.',
  )

  p.push(
    [
      'Packaging and framing:',
      '- All items are presented inside a single open kraft-brown corrugated cardboard gift box.',
      '- The box walls are visible on all four sides and the box is centred in the frame.',
      '- The box interior is filled with brown crinkle-cut shredded paper filler as bedding, clearly visible in every gap between the products.',
      '- Outside the box the background is pure white and seamless. No props, no hands, no surfaces, no text overlays, no watermarks.',
    ].join('\n'),
  )

  p.push(
    [
      'Product arrangement:',
      '- Lay the products flat inside the box in a clean, evenly spaced, grid-like arrangement.',
      '- No overlapping and no stacking — each item sits directly on the filler, fully visible and readable.',
      '- Every label, front face and printed detail faces up and is correctly oriented for the viewer.',
      '- Size the products relative to each other realistically and fill the box neatly.',
    ].join('\n'),
  )

  p.push(
    [
      'Lighting and finish:',
      '- Soft, even studio lighting with neutral white balance.',
      '- Only subtle, natural contact shadows under the items; no harsh highlights and no coloured light.',
      '- Photorealistic commercial e-commerce look, sharp focus across the whole frame, high resolution.',
      '- Square 1:1 aspect ratio.',
    ].join('\n'),
  )

  p.push(
    `The first ${count || 'set of'} provided image${count === 1 ? '' : 's'} ${
      count === 1 ? 'is a PRODUCT reference' : 'are PRODUCT references'
    }. Reproduce every product faithfully — its real shape, colour, material, proportions and its own packaging artwork — and include all of them in the single composition. Do not redesign, restyle or re-label any product.`,
  )

  if (count) {
    p.push(
      `The box must contain EXACTLY these ${count} product${count === 1 ? '' : 's'}, one of each, and nothing else:\n${productNames
        .map((n, i) => `${i + 1}. ${n}`)
        .join('\n')}`,
    )
  }

  if (options.hasLogo) {
    p.push(
      [
        `BRANDING — this is essential: the FINAL provided image is the company logo${
          brand ? ` of ${brand}` : ''
        }. That logo must appear on EVERY SINGLE product in the box, as if each item were real branded corporate merchandise.`,
        '- Apply exactly one logo per product, printed, embossed or label-applied directly onto the item itself or onto its packaging. Every product must carry it — do not leave any item unbranded.',
        '- Keep the placement, relative scale and colour treatment consistent across the whole set: centred on flat faces, sized to sit tastefully within each surface (smaller on small items, larger on wide flat ones).',
        "- The logo must sit in the material: correct perspective for the overhead view, wrapping with any curvature, matching the surface's finish, texture and lighting. It must read as printed on the product, never as a flat sticker pasted onto the photograph.",
        '- Reproduce the logo exactly as provided — identical shapes, proportions and colours. Do not redraw, recolour, mirror, crop, translate it, or add a tagline or extra wording.',
        '- If a provided product reference already shows this logo, keep that one as it is and do not add a second copy.',
        '- Put the logo on the products only — never on the cardboard box, the shredded paper filler, or the background.',
      ].join('\n'),
    )
  }

  p.push(
    `Do not add filler products, invented extras, duplicates, greeting cards, ribbons or decorations. Do not omit any product. Apart from each product's own existing packaging branding${
      options.hasLogo ? ' and the supplied company logo' : ''
    }, no other logo, brand name, slogan or text may appear anywhere in the frame.`,
  )

  p.push(
    'Produce exactly ONE unified photograph of one box. Do NOT make a grid of separate frames, a collage, a contact sheet, a mosaic, or labelled panels.',
  )

  return p.join('\n\n')
}
