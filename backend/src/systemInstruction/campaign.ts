import type { BrandMarkFacts } from '../customizer/brandMarkFacts.js'
import { lineCountClaim } from './brandCustomize.js'
import {
  LOGO_CONTRAST_BLOCK,
  LOGO_ONE_LINE_BLOCK,
  LOGO_PRIME_RULE,
  MARK_SCALE_BLOCK,
  PRINT_TEXT_BLOCK,
  SINGLE_RENDER_BLOCK,
} from './printScale.js'

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

/** One supply the box is actually built from, with a reference image attached. */
export interface KitSupplyFact {
  name: string
  /** The supplier's own copy — dimensions, material, printable surfaces. */
  description?: string | null
}

export interface CampaignKitImageOptions {
  /** A brand logo is supplied as the LAST reference image, after the products. */
  hasLogo?: boolean
  companyName?: string | null
  /** Measured from the supplied logo image — rendered as ground-truth facts. */
  logoFacts?: BrandMarkFacts | null
  /**
   * The box and filling the shopper chose, each supplied as a reference image
   * after the products. Absent for a campaign assembled without a box builder,
   * which falls back to the original kraft-box house style.
   */
  packaging?: KitSupplyFact | null
  filling?: KitSupplyFact | null
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

/**
 * Attachment order is the contract with the caller: products first (the first
 * image is the edit base), then the box, then the filling, then the logo last.
 * Composite models routinely mix up which reference plays which role, so each
 * one is named by position.
 */
function kitReferenceImagesBlock(
  count: number,
  options: {
    hasPackaging?: boolean
    hasFilling?: boolean
    hasLogo?: boolean
    brand?: string
  },
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
  if (options.hasPackaging) {
    refs.push(
      '- The next image is the BOX reference — the actual gift box to photograph, including any artwork already printed on it. It is the container, never an item inside the box.',
    )
  }
  if (options.hasFilling) {
    refs.push(
      '- The next image is the FILLING reference — the packing material that beds the box interior. It is never an item inside the box and never a product.',
    )
  }
  if (options.hasLogo) {
    refs.push(
      `- The FINAL image is the company logo${options.brand ? ` of ${options.brand}` : ''}. It is a branding reference only — never place it in the box as an item.`,
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

/**
 * The box and its filling are real products the shopper picked, so the scene
 * describes THOSE rather than a fixed house style. Falls back to the original
 * kraft box + brown filler when a campaign was assembled without them.
 */
function kitSceneBlock(
  packaging?: KitSupplyFact | null,
  filling?: KitSupplyFact | null,
): string {
  const lines = ['SCENE — one gift box, photographed the same way every time:']

  if (packaging) {
    lines.push(
      `- The box is the "${packaging.name}" shown in the BOX reference image. Reproduce that exact box: same construction, colour, material, finish and proportions, including any artwork already printed on it — never substitute a different or generic box, recolour it, or add printing it does not have. Show it open, viewed from directly overhead, with all four walls visible.`,
    )
    if (packaging.description?.trim()) {
      lines.push(`- About that box (ground truth): ${packaging.description.trim()}`)
    }
  } else {
    lines.push(
      '- One open kraft-brown corrugated cardboard gift box, centred in the frame, all four walls visible.',
    )
  }

  if (filling) {
    lines.push(
      `- Bed the interior with the "${filling.name}" shown in the FILLING reference image — the same colour and texture as that reference, not a generic brown. It is clearly visible in every gap between the products and never covers them.`,
    )
  } else {
    lines.push(
      '- The box interior is bedded with brown crinkle-cut shredded-paper filler, clearly visible in every gap between products.',
    )
  }

  lines.push(
    '- Outside the box the background is pure white and seamless. No props, hands, surfaces, ribbons, greeting cards, decorations, text overlays or watermarks.',
  )
  return lines.join('\n')
}

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
    `- MEASURED LOGO FACTS — measured from the supplied file; treat as ground truth: ${f.shape} — tight bounding box ${f.width}×${f.height} px, aspect ratio ${f.aspectRatio}:1.${lineCountClaim(f)} On every product the printed logo keeps exactly this silhouette and aspect ratio.`,
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
    '- ONE LINE ON EVERY PRODUCT: if the supplied logo is a single line of artwork, it is printed as a single line on every item in the box — the mug, the pen, the notebook, all of them. Never stack it, wrap it, break it across lines, or re-typeset it into a square or vertical block to make it fit.',
    '- When a one-line logo will not fit an item at a comfortable size, PRINT IT SMALLER until it does. Size is what you adjust to make it fit; the layout is not. A small, correct, one-line logo is right — a large stacked one is wrong. If it would become too small to read on a narrow item, move it to a wider face of that same item rather than changing its layout.',
    '- Same lockup on every product: icon and text keep their relative positions (an icon left of the text stays left of it, never above).',
    '- Same letterforms: exact spelling, capitalisation, letter spacing and weight. Never re-type it in another font and never add taglines or extra wording.',
    '- Same colours on every product by default: the original logo colours, exactly — never darkened, lightened, tinted or adapted per item. The ONE permitted change is the LOGO CONTRAST rule: on an item whose surface matches the logo\u2019s own colour, only that mark\u2019s black and white parts swap for the opposite — its other colours, and every other item\u2019s mark, stay exactly as supplied.',
    '- Uniform scale only: never stretch, squash, crop, rotate or mirror it. If the logo does not fit a surface, print it SMALLER or use a wider face of that product — never reshape or re-stack it.',
    '- On each product, first identify what the item IS — from its name in the PRODUCT SET and from its reference image — then choose the OPTIMAL spot: where that product is branded in real life (centre chest of apparel, the upward-facing side of mugs and bottles, the front panel of bags, boxes and notebooks, the barrel of pens) — preferring the widest flat surface visible from above that fits the logo legibly without changing its layout, clear of seams, handles, edges and existing artwork. Centre the logo there with balanced margins.',
    '- Apply the MARK SCALE rules below consistently across the whole set, so the logo reads as the same size relative to each item — proportionally smaller on small items, never larger on big ones. A set where one logo dominates its product is wrong even if each item looks fine on its own.',
    "- Integrate it physically: correct perspective for the overhead view, wrapping with any curvature, matching each surface's finish, texture and lighting — printed on the product, never a flat sticker pasted onto the photograph.",
    '- If a product reference already shows this logo, keep that print as it is and do not add a second copy.',
    '- The logo goes on the products only — never on the box, the filling material or the background. If the BOX reference already carries printed artwork, keep it exactly as it is and do not add the logo to it.',
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
  'PRIORITY — if any two rules conflict, obey the earlier one: (1) the exact product set, (2) product fidelity, (3) the box and filling matching their references, (4) logo fidelity, (5) logo scale — modest and consistent across the set, (6) scene styling.'

function kitFinalCheckBlock(hasLogo: boolean): string {
  return `FINAL CHECK before returning the image: every listed product appears exactly once${
    hasLogo
      ? '; a one-line logo is printed on ONE line on every single product — check each item individually and, if any logo is stacked, wrapped or broken across lines, redo it smaller on one line; the logo on every product has the SAME lockup and aspect ratio as the supplied image, and its original colours — or, where an item\u2019s surface matched the logo\u2019s colour, only the black/white parts swapped with every other colour untouched — clearly visible either way; every logo spans about a quarter to a third of the face it sits on — never past 40% — and none crowds an edge; if a logo looks large, it is too large'
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
    // The logo contract opens the prompt — models weight the first line most.
    hasLogo ? LOGO_PRIME_RULE : '',
    KIT_TASK_BLOCK,
    kitReferenceImagesBlock(count, {
      hasPackaging: Boolean(options.packaging),
      hasFilling: Boolean(options.filling),
      hasLogo,
      brand,
    }),
    kitProductSetBlock(productNames),
    KIT_PRODUCT_FIDELITY_BLOCK,
    kitSceneBlock(options.packaging, options.filling),
    KIT_ARRANGEMENT_BLOCK,
    KIT_LIGHTING_BLOCK,
    hasLogo ? kitBrandingBlock(kitLogoFactsLines(options.logoFacts)) : '',
    hasLogo ? MARK_SCALE_BLOCK : '',
    hasLogo ? LOGO_ONE_LINE_BLOCK : '',
    hasLogo ? LOGO_CONTRAST_BLOCK : '',
    hasLogo ? PRINT_TEXT_BLOCK : '',
    kitTextPolicyBlock(hasLogo),
    KIT_OUTPUT_BLOCK,
    SINGLE_RENDER_BLOCK,
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
    referenceImages: kitReferenceImagesBlock(productNames.length, {
      hasPackaging: Boolean(options.packaging),
      hasFilling: Boolean(options.filling),
      hasLogo: Boolean(options.hasLogo),
      brand,
    }),
    productSet: kitProductSetBlock(productNames),
    measuredLogoFacts: kitLogoFactsLines(options.logoFacts),
    scene: kitSceneBlock(options.packaging, options.filling),
  }
}

/**
 * The built-in prompt with runtime data blocks as `{{placeholders}}` — the
 * starting point shown to super admins when creating an override. Uses the
 * with-logo variant (the shipping configuration).
 */
export const KIT_IMAGE_DEFAULT_TEMPLATE = [
  LOGO_PRIME_RULE,
  KIT_TASK_BLOCK,
  '{{referenceImages}}',
  '{{productSet}}',
  KIT_PRODUCT_FIDELITY_BLOCK,
  '{{scene}}',
  KIT_ARRANGEMENT_BLOCK,
  KIT_LIGHTING_BLOCK,
  kitBrandingBlock('{{measuredLogoFacts}}'),
  MARK_SCALE_BLOCK,
  LOGO_ONE_LINE_BLOCK,
  LOGO_CONTRAST_BLOCK,
  PRINT_TEXT_BLOCK,
  kitTextPolicyBlock(true),
  KIT_OUTPUT_BLOCK,
  SINGLE_RENDER_BLOCK,
  KIT_PRIORITY_BLOCK,
  kitFinalCheckBlock(true),
].join('\n\n')
