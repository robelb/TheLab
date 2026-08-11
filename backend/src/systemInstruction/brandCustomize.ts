import type { BrandMarkFacts } from '../customizer/brandMarkFacts.js'
import {
  LOGO_CONTRAST_BLOCK,
  LOGO_ONE_LINE_BLOCK,
  LOGO_PRIME_RULE,
  MARK_SCALE_BLOCK,
  PRINT_TEXT_BLOCK,
} from './printScale.js'

/**
 * What the measured aspect ratio tells us about the mark's line count, stated
 * as strongly as the measurement supports. Anything wider than tall is a
 * single line in practice; only a tall mark may legitimately be stacked, and
 * there we say nothing rather than assert something we cannot see.
 */
export function lineCountClaim(f: BrandMarkFacts): string {
  if (f.aspectRatio >= 1.8) return ' It is ONE single line of artwork.'
  if (f.aspectRatio >= 1.1) {
    return ' It reads as ONE single line of artwork — do not split it across lines.'
  }
  return ' Keep exactly the number of lines the artwork already has.'
}

export interface CustomizePromptContext {
  companyName?: string | null
  /** What the product IS — lets placement follow the item, not just pixels. */
  productName?: string | null
  productDescription?: string | null
  hasLogo: boolean
  hasFavicon: boolean
  /** Measured from the supplied mark images — rendered as ground-truth facts. */
  logoFacts?: BrandMarkFacts | null
  faviconFacts?: BrandMarkFacts | null
}

/** One measured-facts bullet per mark: silhouette + exact palette. */
function markFactsLines(label: string, f: BrandMarkFacts): string {
  const oneLine = lineCountClaim(f)
  const lines = [
    `- ${label}: ${f.shape} — tight bounding box ${f.width}×${f.height} px, aspect ratio ${f.aspectRatio}:1.${oneLine} The printed mark keeps exactly this silhouette and aspect ratio.`,
  ]
  if (f.colors.length > 0) {
    lines.push(
      `- ${label} colours, measured from the file: ${f.colors.join(', ')}. Print it in exactly these colours.`,
    )
  }
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt sections. Static sections are constants; dynamic ones are functions.
// The same sections feed three consumers, which MUST stay in sync:
//   1. buildCustomizePrompt (the built-in prompt)
//   2. buildCustomizeTemplateVars (runtime data for an admin override template)
//   3. CUSTOMIZE_DEFAULT_TEMPLATE (the editable starting point in the admin UI)
// ─────────────────────────────────────────────────────────────────────────────

const TASK_BLOCK =
  'You are editing a product photograph. Make exactly ONE change: print the brand mark onto the product, the way a professional print shop would produce it. Everything else stays exactly as it is. This is an EDIT of the PRODUCT PHOTO — never a new scene composed from the attachments.'

const SOURCE_GRAPHIC_RULE =
  'It is a source graphic only: it must never appear in the output as its own picture, card, sign, sticker sheet or floating graphic.'

function referenceImagesBlock(ctx: CustomizePromptContext): string {
  const refs = [
    'Reference images, in the order provided:',
    '1. PRODUCT PHOTO — the photograph you are editing. Your output is this same photograph with the mark printed on the product.',
  ]
  if (ctx.hasLogo) {
    refs.push(`2. BRAND LOGO — the artwork to print. ${SOURCE_GRAPHIC_RULE}`)
  }
  if (ctx.hasFavicon) {
    refs.push(
      ctx.hasLogo
        ? '3. BRAND FAVICON — a compact alternative artwork to print, under the same source-graphic-only rule.'
        : `2. BRAND FAVICON — the artwork to print. ${SOURCE_GRAPHIC_RULE}`,
    )
  }
  return refs.join('\n')
}

function outputContractBlock(hasCompanyName: boolean): string {
  return [
    'OUTPUT CONTRACT — the output picture MUST contain:',
    '- The product from the PRODUCT PHOTO, exactly ONCE — same size, same position, same angle, same lighting, same background. The product is the subject of the picture. It is never removed, replaced, redrawn or cropped out.',
    '- The brand mark printed on that product, in exactly one place.',
    'And it MUST NOT contain:',
    '- A second copy of the product — no duplicates, no mirrored or alternate views, no before/after pairs, no size variants.',
    '- The mark by itself on an empty or plain background. If the product is not clearly visible in your output, the output is wrong — start over from the PRODUCT PHOTO.',
    `- Added props, people or other products, and no added text${hasCompanyName ? ' beyond the mark and the optional company name described below' : ' beyond the mark itself'}.`,
  ].join('\n')
}

function markSelectionBlock(ctx: CustomizePromptContext): string {
  if (ctx.hasLogo && ctx.hasFavicon) {
    return "MARK SELECTION: compare the product's print area with both marks and apply whichever ONE stays fully legible at that size without any layout change — typically the logo on wide or flat surfaces and the favicon on small or square ones. Apply exactly one mark, never both."
  }
  if (ctx.hasLogo) return 'MARK SELECTION: use the brand logo as the mark.'
  if (ctx.hasFavicon) return 'MARK SELECTION: use the brand favicon as the mark.'
  return ''
}

const PRIORITY_BLOCK =
  'PRIORITY — if any two rules conflict, obey the earlier one: (1) the product is present exactly once and unchanged, (2) mark fidelity, (3) mark scale — a modest, well-margined print, (4) placement quality. A mark that does not fit a space is made SMALLER or moved to a larger surface — never reshaped, never re-stacked, never enlarged past the scale limits, and never solved by altering, duplicating or removing the product.'

const MARK_FIDELITY_BLOCK = [
  'MARK FIDELITY — reproduce the mark exactly as supplied. The only permitted transformations are uniform scaling, perspective mapping onto the surface, and realistic material/lighting integration:',
  '- Same line count: the mark keeps the same number of lines as the supplied image, and a horizontal wordmark is one line unless the artwork visibly shows otherwise. Never stack, wrap, break or re-flow it, and never introduce a line break the artwork does not have.',
  '- Same lockup: icon and text keep their relative positions (an icon left of the text stays left of it, never above).',
  '- Same letterforms: exact spelling, capitalisation, letter spacing and weight. Never re-type it in another font and never add or remove any element.',
  '- Same colours by default: print the mark in its original colours, exactly — never darkened, lightened, tinted or given gradients or outlines. The ONE permitted change is the LOGO CONTRAST rule: on a surface that matches the mark\u2019s own colour, the whole mark switches to solid white or solid black.',
  '- Uniform scale only: never stretch, squash, crop, rotate, mirror or change its aspect ratio.',
].join('\n')

function measuredFactsBlock(ctx: CustomizePromptContext): string {
  const facts: string[] = []
  if (ctx.hasLogo && ctx.logoFacts) {
    facts.push(markFactsLines('BRAND LOGO', ctx.logoFacts))
  }
  if (ctx.hasFavicon && ctx.faviconFacts) {
    facts.push(markFactsLines('BRAND FAVICON', ctx.faviconFacts))
  }
  if (facts.length === 0) return ''
  return [
    'MEASURED MARK FACTS — measured from the supplied files; treat as ground truth and verify your output against them:',
    ...facts,
  ].join('\n')
}

/**
 * What the product is, in words — the photo alone can be ambiguous (a black
 * cylinder could be a bottle, a tube or a speaker), and the right print spot
 * depends on which it is.
 */
/** Catalogue copy arrives as HTML of any length; the prompt gets one clean clause. */
function clampDescription(raw: string): string {
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 400 ? `${text.slice(0, 400).trimEnd()}…` : text
}

function productFactsBlock(ctx: CustomizePromptContext): string {
  const name = ctx.productName?.trim()
  const description = ctx.productDescription?.trim()
  if (!name && !description) return ''
  const facts: string[] = ['THE PRODUCT — what you are printing on:']
  if (name) facts.push(`- It is: ${name}.`)
  if (description) {
    const clean = clampDescription(description)
    if (clean) facts.push(`- Catalogue description: ${clean}`)
  }
  facts.push(
    '- Combine these facts with what you actually see in the PRODUCT PHOTO to identify the product type, its material and which surface faces the camera — then choose the placement the way a merch printer would for exactly this item.',
  )
  return facts.join('\n')
}

const PLACEMENT_BLOCK = [
  'PLACEMENT — first CHOOSE the optimal spot on the product, then print there. Decide in this order:',
  '1. If the photo marks a print zone (dashed outline or placeholder), that is the spot — print there and remove the zone indicator.',
  "2. Otherwise identify what the product IS — from THE PRODUCT facts when given, and from the photo itself — and use the spot where that product is branded in real life: centre chest of a shirt or hoodie; the side of a mug or bottle facing the camera, centred; the front panel of a bag, box or notebook; the barrel of a pen; the front face of packaging.",
  '3. If neither applies, pick the surface that scores best on ALL of: (a) wide and flat enough for the mark at a legible size WITHOUT changing its layout — a wide wordmark needs a wide surface; (b) fully visible and facing the camera, not curving out of view; (c) evenly lit; (d) clear of seams, zips, handles, buttons, edges and existing artwork.',
  'Then print it there:',
  '- Centre the mark within the chosen area with balanced margins on every side — not crammed against an edge.',
  '- The mark goes on the product itself (or its packaging shown in the photo) — never floating in the background. Always apply it, never skip it.',
  "- Integrate it physically: match the product's perspective, surface curvature, lighting, texture and finish so it reads as printed or embossed, never as a flat sticker pasted onto the photograph.",
].join('\n')

function companyNameBlock(name: string | undefined): string {
  if (!name) return ''
  return `COMPANY NAME (optional): the company is "${name}". Add the name only if the print area comfortably fits it as a small, clearly separate text element near the mark, set on one line and no taller than the mark itself — never merged into the mark and never used to re-letter it. When in doubt, leave it out.`
}

const CANVAS_BLOCK =
  'CANVAS: if the source photo is not square, extend the existing background outward — same colour and texture, seamless — to a 1:1 square canvas. Never crop the photo and never move or rescale the product.'

const OUTPUT_BLOCK =
  'OUTPUT: exactly ONE photograph — the edited product photo. No collage, split layout, grid, banner, multiple views, borders, captions or watermarks.'

const FINAL_CHECK_BLOCK =
  'FINAL CHECK before returning the image — if any of these fail, discard the result and redo the edit from the PRODUCT PHOTO: (1) the product from the PRODUCT PHOTO is present, exactly ONCE, unchanged in size, position and appearance; (2) the output is not a logo-only image and contains no duplicate of the product; (3) the printed mark has the SAME layout as the supplied mark image — same number of lines, same lockup, same aspect ratio; (4) the printed mark has the SAME colours as the supplied mark image — or, where its colours would have vanished against the surface, is rendered ENTIRELY in solid white or solid black, and is clearly visible either way; (5) the mark spans about a quarter to a third of the width of the face it sits on — never past 40% — with clear space around it and no edge crowding; if it looks large, it is too large; (6) apart from the printed mark and any seamless background extension, nothing differs from the PRODUCT PHOTO.'

/**
 * Build the single prompt sent for both OpenAI and Gemini brand customization
 * (login-time featured-product branding).
 *
 * Images are passed in this order by the callers:
 *   1. Product photo (always first)
 *   2. Logo (if available)
 *   3. Favicon (if available)
 *
 * Prompt design notes — deliberate, keep these properties when editing:
 *   - Reference images are enumerated by position: edit models routinely
 *     confuse which attachment plays which role.
 *   - The OUTPUT CONTRACT comes right after the image roles and pins the two
 *     observed subject failures: the product duplicated, or the product
 *     dropped entirely with only the logo rendered.
 *   - Each rule appears exactly once; duplicated or conflicting instructions
 *     dilute compliance.
 *   - An explicit PRIORITY order pre-resolves conflicts (e.g. the model
 *     re-typesetting a wide wordmark onto multiple lines to make it fit).
 *   - The FINAL CHECK restates every hard constraint last (recency anchor).
 */
export function buildCustomizePrompt(ctx: CustomizePromptContext): string {
  const name = ctx.companyName?.trim() || undefined
  return [
    // The logo contract opens the prompt — models weight the first line most.
    ctx.hasLogo || ctx.hasFavicon ? LOGO_PRIME_RULE : '',
    TASK_BLOCK,
    referenceImagesBlock(ctx),
    outputContractBlock(Boolean(name)),
    markSelectionBlock(ctx),
    PRIORITY_BLOCK,
    MARK_FIDELITY_BLOCK,
    measuredFactsBlock(ctx),
    MARK_SCALE_BLOCK,
    LOGO_ONE_LINE_BLOCK,
    LOGO_CONTRAST_BLOCK,
    PRINT_TEXT_BLOCK,
    productFactsBlock(ctx),
    PLACEMENT_BLOCK,
    companyNameBlock(name),
    CANVAS_BLOCK,
    OUTPUT_BLOCK,
    FINAL_CHECK_BLOCK,
  ]
    .filter(Boolean)
    .join('\n\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin-override support (system-instructions feature)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime data for a `brand-customize` override template. Placeholder names
 * are the public contract documented in the admin UI — renaming one breaks
 * saved overrides.
 */
export function buildCustomizeTemplateVars(
  ctx: CustomizePromptContext,
): Record<string, string> {
  const name = ctx.companyName?.trim() || undefined
  return {
    companyName: name ?? '',
    referenceImages: referenceImagesBlock(ctx),
    markSelection: markSelectionBlock(ctx),
    measuredMarkFacts: measuredFactsBlock(ctx),
    productFacts: productFactsBlock(ctx),
    companyNameSection: companyNameBlock(name),
  }
}

/**
 * The built-in prompt with runtime data blocks as `{{placeholders}}` — the
 * starting point shown to super admins when creating an override.
 */
export const CUSTOMIZE_DEFAULT_TEMPLATE = [
  LOGO_PRIME_RULE,
  TASK_BLOCK,
  '{{referenceImages}}',
  outputContractBlock(true),
  '{{markSelection}}',
  PRIORITY_BLOCK,
  MARK_FIDELITY_BLOCK,
  '{{measuredMarkFacts}}',
  MARK_SCALE_BLOCK,
  LOGO_ONE_LINE_BLOCK,
  LOGO_CONTRAST_BLOCK,
  PRINT_TEXT_BLOCK,
  '{{productFacts}}',
  PLACEMENT_BLOCK,
  '{{companyNameSection}}',
  CANVAS_BLOCK,
  OUTPUT_BLOCK,
  FINAL_CHECK_BLOCK,
].join('\n\n')
