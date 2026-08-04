import type { BrandMarkFacts } from '../customizer/brandMarkFacts.js'

export interface CustomizePromptContext {
  companyName?: string | null
  hasLogo: boolean
  hasFavicon: boolean
  /** Measured from the supplied mark images — rendered as ground-truth facts. */
  logoFacts?: BrandMarkFacts | null
  faviconFacts?: BrandMarkFacts | null
}

/** One measured-facts bullet per mark: silhouette + exact palette. */
function markFactsLines(label: string, f: BrandMarkFacts): string {
  const oneLine = f.aspectRatio >= 1.8 ? ' It is ONE single line of artwork.' : ''
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
 *     dropped entirely with only the logo rendered. The product's presence is
 *     protected as explicitly as the mark's fidelity.
 *   - Each rule appears exactly once; duplicated or conflicting instructions
 *     dilute compliance.
 *   - An explicit PRIORITY order pre-resolves conflicts (e.g. the model
 *     re-typesetting a wide wordmark onto multiple lines to make it fit).
 *   - The FINAL CHECK restates every hard constraint last (recency anchor).
 */
export function buildCustomizePrompt(ctx: CustomizePromptContext): string {
  const name = ctx.companyName?.trim()
  const parts: string[] = []

  // ── Task: an edit, never a new composition ───────────────────────────────
  parts.push(
    'You are editing a product photograph. Make exactly ONE change: print the brand mark onto the product, the way a professional print shop would produce it. Everything else stays exactly as it is. This is an EDIT of the PRODUCT PHOTO — never a new scene composed from the attachments.',
  )

  // ── Reference images, by position ────────────────────────────────────────
  const sourceGraphicRule =
    'It is a source graphic only: it must never appear in the output as its own picture, card, sign, sticker sheet or floating graphic.'
  const refs = [
    'Reference images, in the order provided:',
    '1. PRODUCT PHOTO — the photograph you are editing. Your output is this same photograph with the mark printed on the product.',
  ]
  if (ctx.hasLogo) {
    refs.push(`2. BRAND LOGO — the artwork to print. ${sourceGraphicRule}`)
  }
  if (ctx.hasFavicon) {
    refs.push(
      ctx.hasLogo
        ? '3. BRAND FAVICON — a compact alternative artwork to print, under the same source-graphic-only rule.'
        : `2. BRAND FAVICON — the artwork to print. ${sourceGraphicRule}`,
    )
  }
  parts.push(refs.join('\n'))

  // ── Output contract: what the picture contains ───────────────────────────
  parts.push(
    [
      'OUTPUT CONTRACT — the output picture MUST contain:',
      '- The product from the PRODUCT PHOTO, exactly ONCE — same size, same position, same angle, same lighting, same background. The product is the subject of the picture. It is never removed, replaced, redrawn or cropped out.',
      '- The brand mark printed on that product, in exactly one place.',
      'And it MUST NOT contain:',
      '- A second copy of the product — no duplicates, no mirrored or alternate views, no before/after pairs, no size variants.',
      '- The mark by itself on an empty or plain background. If the product is not clearly visible in your output, the output is wrong — start over from the PRODUCT PHOTO.',
      `- Added props, people or other products, and no added text${name ? ' beyond the mark and the optional company name described below' : ' beyond the mark itself'}.`,
    ].join('\n'),
  )

  // ── Which mark to apply ──────────────────────────────────────────────────
  if (ctx.hasLogo && ctx.hasFavicon) {
    parts.push(
      "MARK SELECTION: compare the product's print area with both marks and apply whichever ONE stays fully legible at that size without any layout change — typically the logo on wide or flat surfaces and the favicon on small or square ones. Apply exactly one mark, never both.",
    )
  } else if (ctx.hasLogo) {
    parts.push('MARK SELECTION: use the brand logo as the mark.')
  } else if (ctx.hasFavicon) {
    parts.push('MARK SELECTION: use the brand favicon as the mark.')
  }

  // ── Conflict resolution ──────────────────────────────────────────────────
  parts.push(
    'PRIORITY — if any two rules conflict, obey the earlier one: (1) the product is present exactly once and unchanged, (2) mark fidelity, (3) placement quality, (4) mark size and visibility. A mark that does not fit a space is made SMALLER or moved to a larger surface — never reshaped, never re-stacked, and never solved by altering, duplicating or removing the product.',
  )

  // ── Mark fidelity ────────────────────────────────────────────────────────
  parts.push(
    [
      'MARK FIDELITY — reproduce the mark exactly as supplied. The only permitted transformations are uniform scaling, perspective mapping onto the surface, and realistic material/lighting integration:',
      '- Same line count: the mark keeps the same number of lines as the supplied image. A one-line horizontal wordmark stays on one line — never stack, wrap, break or re-flow it.',
      '- Same lockup: icon and text keep their relative positions (an icon left of the text stays left of it, never above).',
      '- Same letterforms: exact spelling, capitalisation, letter spacing and weight. Never re-type it in another font and never add or remove any element.',
      '- Same colours: print the mark in its original colours, exactly. Never recolour, invert, darken, lighten, add gradients or outlines, or adapt the colours to the product. If the colours would blend into the chosen surface, move the mark to a surface where they stay visible — never change the colours.',
      '- Uniform scale only: never stretch, squash, crop, rotate, mirror or change its aspect ratio.',
    ].join('\n'),
  )

  // ── Measured ground truth (when available) ───────────────────────────────
  const facts: string[] = []
  if (ctx.hasLogo && ctx.logoFacts) {
    facts.push(markFactsLines('BRAND LOGO', ctx.logoFacts))
  }
  if (ctx.hasFavicon && ctx.faviconFacts) {
    facts.push(markFactsLines('BRAND FAVICON', ctx.faviconFacts))
  }
  if (facts.length > 0) {
    parts.push(
      [
        'MEASURED MARK FACTS — measured from the supplied files; treat as ground truth and verify your output against them:',
        ...facts,
      ].join('\n'),
    )
  }

  // ── Placement: pick the optimal spot, then integrate ─────────────────────
  parts.push(
    [
      'PLACEMENT — first CHOOSE the optimal spot on the product, then print there. Decide in this order:',
      '1. If the photo marks a print zone (dashed outline or placeholder), that is the spot — print there and remove the zone indicator.',
      "2. Otherwise use the spot where this product category is branded in real life: centre chest of a shirt or hoodie; the side of a mug or bottle facing the camera, centred; the front panel of a bag, box or notebook; the barrel of a pen; the front face of packaging.",
      '3. If neither applies, pick the surface that scores best on ALL of: (a) wide and flat enough for the mark at a legible size WITHOUT changing its layout — a wide wordmark needs a wide surface; (b) fully visible and facing the camera, not curving out of view; (c) evenly lit; (d) clear of seams, zips, handles, buttons, edges and existing artwork.',
      'Then print it there:',
      '- Centre the mark within the chosen area with balanced margins on every side — not crammed against an edge.',
      '- The mark goes on the product itself (or its packaging shown in the photo) — never floating in the background. Always apply it, never skip it.',
      "- Integrate it physically: match the product's perspective, surface curvature, lighting, texture and finish so it reads as printed or embossed, never as a flat sticker pasted onto the photograph.",
      '- Size it to be clearly legible at a glance while respecting the fidelity rules.',
    ].join('\n'),
  )

  // ── Optional company name ────────────────────────────────────────────────
  if (name) {
    parts.push(
      `COMPANY NAME (optional): the company is "${name}". Add the name only if the print area comfortably fits it as a small, clearly separate text element near the mark — never merged into the mark and never used to re-letter it. When in doubt, leave it out.`,
    )
  }

  // ── Canvas ───────────────────────────────────────────────────────────────
  parts.push(
    'CANVAS: if the source photo is not square, extend the existing background outward — same colour and texture, seamless — to a 1:1 square canvas. Never crop the photo and never move or rescale the product.',
  )

  // ── Output format ────────────────────────────────────────────────────────
  parts.push(
    'OUTPUT: exactly ONE photograph — the edited product photo. No collage, split layout, grid, banner, multiple views, borders, captions or watermarks.',
  )

  // ── Recency anchor: restate every hard constraint last ───────────────────
  parts.push(
    'FINAL CHECK before returning the image — if any of these fail, discard the result and redo the edit from the PRODUCT PHOTO: (1) the product from the PRODUCT PHOTO is present, exactly ONCE, unchanged in size, position and appearance; (2) the output is not a logo-only image and contains no duplicate of the product; (3) the printed mark has the SAME layout as the supplied mark image — same number of lines, same lockup, same aspect ratio; (4) the printed mark has the SAME colours as the supplied mark image, unaltered; (5) apart from the printed mark and any seamless background extension, nothing differs from the PRODUCT PHOTO.',
  )

  return parts.join('\n\n')
}
