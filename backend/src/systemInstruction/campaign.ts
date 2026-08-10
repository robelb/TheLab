import type { BrandMarkFacts } from '../customizer/brandMarkFacts.js'

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
  /** Measured from the supplied logo image — rendered as ground-truth facts. */
  logoFacts?: BrandMarkFacts | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Kit-image prompt sections. Static sections are constants; dynamic ones are
// functions. The same sections feed three consumers, which MUST stay in sync:
//   1. buildCampaignKitImagePrompt (the built-in prompt)
//   2. buildKitTemplateVars (runtime data for an admin override template)
//   3. KIT_IMAGE_DEFAULT_TEMPLATE (the editable starting point in the admin UI)
// ─────────────────────────────────────────────────────────────────────────────

const KIT_TASK_BLOCK =
  'You are an expert commercial product photographer and photo compositor. Create ONE photorealistic top-down (90° overhead) flat-lay photograph of a corporate gift box that contains exactly the products listed below.'

function kitReferenceImagesBlock(
  count: number,
  hasLogo: boolean,
  brand: string | undefined,
): string {
  const refs = ['Reference images, in the order provided:']
  if (count === 1) {
    refs.push('- Image 1 is the PRODUCT reference for product 1 below.')
  } else if (count > 1) {
    refs.push(
      `- Images 1-${count} are PRODUCT references, in the same order as the numbered product list below (image 1 shows product 1, image 2 shows product 2, and so on).`,
    )
  } else {
    refs.push('- The provided images are PRODUCT references.')
  }
  if (hasLogo) {
    refs.push(
      `- The FINAL image is the company logo${brand ? ` of ${brand}` : ''}. It is a branding reference only — never place it in the box as an item.`,
    )
  }
  return refs.join('\n')
}

function kitProductSetBlock(productNames: string[]): string {
  const count = productNames.length
  if (!count) return ''
  return `PRODUCT SET — the box contains EXACTLY these ${count} product${count === 1 ? '' : 's'}, one of each, and nothing else:\n${productNames
    .map((n, i) => `${i + 1}. ${n}`)
    .join('\n')}`
}

const KIT_PRODUCT_FIDELITY_BLOCK = [
  'PRODUCT FIDELITY:',
  '- Reproduce each product faithfully from its reference image: real shape, colour, material, proportions and its own packaging artwork. Never redesign, restyle, recolour or re-label a product.',
  '- Include every listed product exactly once. No duplicates, no substitutes, no invented extras, no omissions.',
].join('\n')

const KIT_SCENE_BLOCK = [
  'SCENE — fixed house style, identical for every render:',
  '- One open kraft-brown corrugated cardboard gift box, centred in the frame, all four walls visible.',
  '- The box interior is bedded with brown crinkle-cut shredded-paper filler, clearly visible in every gap between products.',
  '- Outside the box the background is pure white and seamless. No props, hands, surfaces, ribbons, greeting cards, decorations, text overlays or watermarks.',
].join('\n')

const KIT_ARRANGEMENT_BLOCK = [
  'ARRANGEMENT:',
  '- Lay the products flat in a clean, evenly spaced, grid-like arrangement — no overlapping, no stacking; each item sits directly on the filler, fully visible.',
  '- Every label, front face and printed detail faces up and reads correctly for the viewer.',
  '- Keep relative product sizes realistic and fill the box neatly.',
].join('\n')

const KIT_LIGHTING_BLOCK = [
  'LIGHTING AND FINISH:',
  '- Soft, even studio lighting with neutral white balance; only subtle, natural contact shadows under the items — no harsh highlights, no coloured light.',
  '- Photorealistic commercial e-commerce quality: sharp focus across the whole frame, high resolution, square 1:1 aspect ratio.',
].join('\n')

/** The measured-facts bullets injected into the branding block ('' when absent). */
function kitLogoFactsLines(f: BrandMarkFacts | null | undefined): string {
  if (!f) return ''
  const lines = [
    `- MEASURED LOGO FACTS — measured from the supplied file; treat as ground truth: ${f.shape} — tight bounding box ${f.width}×${f.height} px, aspect ratio ${f.aspectRatio}:1.${f.aspectRatio >= 1.8 ? ' It is ONE single line of artwork.' : ''} On every product the printed logo keeps exactly this silhouette and aspect ratio.`,
  ]
  if (f.colors.length > 0) {
    lines.push(
      `- MEASURED LOGO COLOURS: ${f.colors.join(', ')}. On every product, print the logo in exactly these colours.`,
    )
  }
  return lines.join('\n')
}

/** `factsLines` slots in before the reproduce-exactly bullet; '' to omit. */
function kitBrandingBlock(factsLines: string): string {
  return [
    'BRANDING — essential: apply the company logo (the final reference image) to EVERY product in the box, as if each item were genuine branded corporate merchandise.',
    '- Exactly one logo per product, printed, embossed or label-applied directly onto the item itself or onto its packaging. No item is left unbranded.',
    ...(factsLines ? [factsLines] : []),
    '- Reproduce the logo exactly as supplied: identical shapes, colours and proportions. The only permitted transformations are uniform scaling, perspective mapping onto the surface, and material/lighting integration.',
    '- Same line count on every product: the logo keeps the same number of lines as the supplied image. A one-line horizontal wordmark stays on one line — never stack, wrap, break or re-flow it to fit.',
    '- Same lockup on every product: icon and text keep their relative positions (an icon left of the text stays left of it, never above).',
    '- Same letterforms: exact spelling, capitalisation, letter spacing and weight. Never re-type it in another font and never add taglines or extra wording.',
    '- Same colours on every product: the original logo colours, exactly. Never recolour, invert, darken, lighten or adapt them to an item — if the colours would blend into a surface, place the logo on a lighter or darker area of that item instead of changing them.',
    '- Uniform scale only: never stretch, squash, crop, rotate or mirror it. If the logo does not fit a surface, print it SMALLER or use a wider face of that product — never reshape or re-stack it.',
    '- On each product, choose the OPTIMAL spot: where that product category is branded in real life (centre chest of apparel, the upward-facing side of mugs and bottles, the front panel of bags, boxes and notebooks, the barrel of pens) — preferring the widest flat surface visible from above that fits the logo legibly without changing its layout, clear of seams, handles, edges and existing artwork. Centre the logo there with balanced margins.',
    '- Keep the placement logic and relative scale consistent across the whole set: smaller on small items, larger on wide flat ones.',
    "- Integrate it physically: correct perspective for the overhead view, wrapping with any curvature, matching each surface's finish, texture and lighting — printed on the product, never a flat sticker pasted onto the photograph.",
    '- If a product reference already shows this logo, keep that print as it is and do not add a second copy.',
    '- The logo goes on the products only — never on the cardboard box, the shredded-paper filler or the background.',
  ].join('\n')
}

function kitTextPolicyBlock(hasLogo: boolean): string {
  return `TEXT POLICY: apart from each product's own existing packaging artwork${
    hasLogo ? ' and the supplied company logo' : ''
  }, no other logo, brand name, slogan or text may appear anywhere in the frame.`
}

const KIT_OUTPUT_BLOCK =
  'OUTPUT: exactly ONE unified photograph of one box — never a grid of separate frames, a collage, a contact sheet, a mosaic or labelled panels.'

const KIT_PRIORITY_BLOCK =
  'PRIORITY — if any two rules conflict, obey the earlier one: (1) the exact product set, (2) product fidelity, (3) logo fidelity, (4) scene styling.'

function kitFinalCheckBlock(hasLogo: boolean): string {
  return `FINAL CHECK before returning the image: every listed product appears exactly once${
    hasLogo
      ? '; the logo on every product has the SAME layout as the supplied logo image (same number of lines, same lockup, same aspect ratio) and the SAME colours, unaltered'
      : ''
  }; the output is one single photograph of one box. If any check fails, correct it and return the corrected image.`
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
 *
 * Prompt design notes — deliberate, keep these properties when editing:
 *   - Reference images are mapped to the numbered product list BY POSITION
 *     (image k = product k, logo last): composite models routinely mix up
 *     which reference belongs to which item.
 *   - Each rule appears exactly once, grouped in labelled sections; duplicated
 *     or conflicting instructions dilute compliance.
 *   - An explicit PRIORITY order pre-resolves conflicts, and the branding
 *     block pins the known failure mode of re-stacking a wide wordmark onto
 *     multiple lines so it fits a small product.
 */
export function buildCampaignKitImagePrompt(
  productNames: string[],
  options: CampaignKitImageOptions = {},
): string {
  const count = productNames.length
  const brand = options.companyName?.trim()
  const hasLogo = Boolean(options.hasLogo)

  return [
    KIT_TASK_BLOCK,
    kitReferenceImagesBlock(count, hasLogo, brand),
    kitProductSetBlock(productNames),
    KIT_PRODUCT_FIDELITY_BLOCK,
    KIT_SCENE_BLOCK,
    KIT_ARRANGEMENT_BLOCK,
    KIT_LIGHTING_BLOCK,
    hasLogo ? kitBrandingBlock(kitLogoFactsLines(options.logoFacts)) : '',
    kitTextPolicyBlock(hasLogo),
    KIT_OUTPUT_BLOCK,
    KIT_PRIORITY_BLOCK,
    kitFinalCheckBlock(hasLogo),
  ]
    .filter(Boolean)
    .join('\n\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin-override support (system-instructions feature)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime data for a `campaign-kit-image` override template. Placeholder names
 * are the public contract documented in the admin UI — renaming one breaks
 * saved overrides.
 */
export function buildKitTemplateVars(
  productNames: string[],
  options: CampaignKitImageOptions = {},
): Record<string, string> {
  const brand = options.companyName?.trim()
  return {
    companyName: brand ?? '',
    productCount: String(productNames.length),
    referenceImages: kitReferenceImagesBlock(
      productNames.length,
      Boolean(options.hasLogo),
      brand,
    ),
    productSet: kitProductSetBlock(productNames),
    measuredLogoFacts: kitLogoFactsLines(options.logoFacts),
  }
}

/**
 * The built-in prompt with runtime data blocks as `{{placeholders}}` — the
 * starting point shown to super admins when creating an override. Uses the
 * with-logo variant (the shipping configuration).
 */
export const KIT_IMAGE_DEFAULT_TEMPLATE = [
  KIT_TASK_BLOCK,
  '{{referenceImages}}',
  '{{productSet}}',
  KIT_PRODUCT_FIDELITY_BLOCK,
  KIT_SCENE_BLOCK,
  KIT_ARRANGEMENT_BLOCK,
  KIT_LIGHTING_BLOCK,
  kitBrandingBlock('{{measuredLogoFacts}}'),
  kitTextPolicyBlock(true),
  KIT_OUTPUT_BLOCK,
  KIT_PRIORITY_BLOCK,
  kitFinalCheckBlock(true),
].join('\n\n')
