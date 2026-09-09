import type { BrandMarkFacts } from '../customizer/brandMarkFacts.js'
import { lineCountClaim } from './brandCustomize.js'
import {
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

/**
 * What the render is being asked to do about branding.
 *
 *   - `apply`   — some products arrive plain and the logo goes onto them.
 *   - `preserve`— every product already carries the mark the customer placed.
 *   - `mixed`   — some carry the customer's mark, the rest are plain and stay
 *                 plain.
 *   - `unbranded` — nothing is branded, and nothing is to be branded.
 *
 * Named `unbranded` rather than `plain` because "plain products" already
 * means the opposite thing in this file and in the prompt audit: products that
 * arrive plain SO THAT the logo can be put on them.
 *
 * The last two are composition rather than design, and the SERVICE has to
 * agree with the prompt about which: in those modes the logo is not attached
 * as a reference image at all. Leaving it attached is what lets the model
 * apply a mark anyway — the prompt can ask it not to, but not handing it the
 * logo is what makes that stick.
 *
 * `unbranded` is asked for, never inferred. An empty pre-branded list means only
 * that no product carries a mark, which is equally true of a kit someone wants
 * branded from scratch — the shipping photoshoot — and of a box whose owner
 * has designed nothing. Which one it is, is the caller's to say.
 */
export type KitBrandingMode = 'apply' | 'preserve' | 'mixed' | 'unbranded'

export function kitBrandingMode(
  productNames: string[],
  preBranded: string[] | undefined,
  noBranding = false,
): KitBrandingMode {
  if (productNames.length && preBranded?.length) {
    if (productNames.every((name) => preBranded.includes(name))) {
      return 'preserve'
    }
    // Some designed, some not.
    //
    // This used to fall through to `apply`, and `apply` hands over the logo:
    // design one product out of three and all three came back wearing a mark,
    // two of them placed by the model. A caller who said `noBranding` has
    // already answered the question — nothing gets branded that the customer
    // did not brand themselves — and the answer does not change just because
    // one product in the box happens to carry a design. A photoshoot, which
    // says nothing, still means what it always did: brand the plain ones.
    if (noBranding) return 'mixed'
  }
  return noBranding ? 'unbranded' : 'apply'
}

/** True when the render has nothing to brand, so it is a pure composition. */
export function isCompositionOnly(
  productNames: string[],
  preBranded: string[] | undefined,
  noBranding = false,
): boolean {
  return kitBrandingMode(productNames, preBranded, noBranding) !== 'apply'
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
  /**
   * Products whose reference image ALREADY carries the logo — because the
   * customer designed them in the placement editor, or because onboarding
   * branded them.
   *
   * This matters more than it looks. The rest of this prompt is written for
   * plain catalogue products and tells the model to put the logo on each one at
   * a house size, in the spot it judges best. Aimed at an image that is already
   * branded, that is an instruction to move and resize a mark the customer
   * positioned by hand — the group shot then disagrees with the very products
   * they just approved. Named here, those products are preserved instead.
   */
  preBranded?: string[]
  /**
   * Photograph the products exactly as they are and brand nothing.
   *
   * Set when the customer has designed none of them. Without it the render put
   * the logo on every item in a box nobody had designed yet — branding sized
   * and positioned by a model rather than by them, which they then had to tell
   * apart from their own work. Nothing designed now means nothing branded.
   *
   * Ignored when every product is already branded: that set has nothing to
   * brand either, and `preserve` says something stronger and truer about it.
   */
  noBranding?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Kit-image prompt sections. Static sections are constants; dynamic ones are
// functions. The same sections feed three consumers, which MUST stay in sync:
//   1. buildCampaignKitImagePrompt (the built-in prompt)
//   2. buildKitTemplateVars (runtime data for an admin override template)
//   3. KIT_IMAGE_DEFAULT_TEMPLATE (the editable starting point in the admin UI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A compact recap of the per-product logo contract, placed right after the
 * task statement. The detailed rules live in the branding/scale/one-line
 * blocks further down; with many products in one frame the model needs the
 * headline version early, before it starts composing.
 */
const KIT_LOGO_RECAP =
  'EVERY PRODUCT GETS THE LOGO — the same supplied logo on each product, exactly as it is: copied from its reference image (never drawn from memory or invented), SMALL — about a quarter to a third of the face it sits on — and on ONE line when the artwork is one line, which it is for most logos. One logo per product, no product left out, and never a stacked, wrapped or re-typeset copy on any of them.'

/**
 * Which headline contract to open with. "Put the logo on everything" is right
 * for plain catalogue products and wrong for ones the customer already
 * branded — so say the true thing for the set actually in hand.
 */
function kitLogoRecap(allPreBranded: boolean): string {
  return allPreBranded
    ? 'EVERY PRODUCT IS ALREADY BRANDED — each product reference already carries the logo, printed where the customer placed it and at the size they chose. Your job is to preserve those marks exactly as they appear, not to apply, move or resize any of them. Do not add a logo to anything, and do not add a second copy to a product that has one.'
    : KIT_LOGO_RECAP
}

const KIT_TASK_BLOCK =
  'You are an expert commercial product photographer and photo compositor. Create ONE photorealistic top-down (90° overhead) flat-lay photograph of a corporate gift box that contains exactly the products listed below.'

/**
 * The task, restated for the case where every product has already been designed
 * and photographed.
 *
 * The default brief above is a *photoshoot*: it hands the model a logo and asks
 * it to brand a set of plain catalogue products. Pointed at products the
 * customer has already designed one by one, that is an invitation to redesign
 * every one of them — and it does, which is exactly the complaint. So when
 * there is nothing left to brand, the job is renamed to what it actually is:
 * arranging finished photographs inside a box.
 */
const KIT_COMPOSE_TASK_BLOCK =
  'You are an expert photo compositor. You are given FINISHED product photographs — real items that have already been designed, branded and shot — and your job is to arrange them inside a gift box as ONE photorealistic top-down (90° overhead) flat-lay photograph. This is a composition task, not a design task: you place the products, you do not redraw them.'

/**
 * The task for a box whose products carry no branding and are not to be given
 * any.
 *
 * Kept apart from the block above rather than sharing it, because that one
 * opens by telling the model the products "have already been designed,
 * branded and shot". Said of plain catalogue stock that is simply false, and a
 * model handed a false premise resolves it the obvious way: it supplies the
 * branding the brief says must already be there. The premise is the bug, so
 * this states the true one — these products are unbranded, and unbranded is
 * what the customer chose.
 */
const KIT_UNBRANDED_TASK_BLOCK = [
  'You are an expert photo compositor. You are given product photographs of PLAIN, UNBRANDED items and your job is to arrange them inside a gift box as ONE photorealistic top-down (90° overhead) flat-lay photograph. This is a composition task, not a design task: you place the products, you do not decorate them.',
  'NO BRANDING IN THIS BOX — the customer has not designed any of these products, and photographing them plain is the point. Do not add a logo, monogram, wordmark, brand name, slogan, label, badge, sticker, engraving, embroidery or printed graphic of any kind to any product, to the box, to the filling or to the background. No logo has been supplied to you, and none is to be invented, drawn from memory, or inferred from the product names, the box or anything else in the frame. An unbranded product in the output is the correct result, not an unfinished one.',
].join('\n\n')

/**
 * The task for a box the customer designed part of and left the rest of alone.
 *
 * Neither block above is true of it: one opens by saying every item has
 * already been designed and branded, the other that none has. Handed a false
 * premise, the model resolves it against the references it can see — and the
 * way it resolved this one was to brand the plain products to match the
 * designed one. Three products, one of them designed, three logos back.
 *
 * So this states the true premise, and names the specific move to avoid:
 * copying a mark off another product in the same frame. Consistency is exactly
 * what a compositor would reach for here, and it is exactly wrong — the plain
 * products are plain because the customer left them that way.
 */
const KIT_MIXED_TASK_BLOCK = [
  'You are an expert photo compositor. You are given a mix of FINISHED product photographs: SOME of these items have already been designed and branded by the customer, and the REST are plain, unbranded stock. Your job is to arrange them all inside a gift box as ONE photorealistic top-down (90° overhead) flat-lay photograph. This is a composition task, not a design task: you place the products, you do not redraw them.',
  'EVERY PRODUCT KEEPS EXACTLY WHAT IT ARRIVES WITH — the branded ones keep their marks, untouched and unmoved; the plain ones stay plain. The customer branded some of these deliberately and left the others alone just as deliberately, so a plain product in this box is a finished product, not an unfinished one. Do not add a logo, monogram, wordmark, brand name, slogan, label, badge, sticker, engraving, embroidery or printed graphic to any product whose own reference photograph does not already show it — not to match the branded items, not to make the set look consistent, not for any other reason. No logo has been supplied to you: none is to be invented, inferred from the product names, or copied off another product in the frame.',
].join('\n\n')

/**
 * The hard reproduction contract for composition mode.
 *
 * Stated as an explicit allow-list and deny-list rather than as an adjective
 * like "faithfully", because "faithfully" is what the old PRODUCT FIDELITY
 * block already said while the model quietly re-rendered the branding anyway.
 * The allow-list is short on purpose: scale, position, viewing angle, light.
 * Everything else about a product is already decided.
 */
const KIT_REPRODUCE_EXACTLY_BLOCK = [
  'REPRODUCE EACH PRODUCT EXACTLY — this is the single most important rule in this brief, ahead of composition, styling and everything else. Each product reference is a finished photograph of a real item, and the version in your output must be that same item.',
  '- Copy each product exactly as its reference shows it: the same shape, proportions, colour, material and finish, and — critically — the same printed artwork, logo, lettering and graphics, in the same place on the item, at the same size relative to the item, in the same colours.',
  '- The ONLY things you may change are: SCALE, so the item fits the box; POSITION, so it sits in the arrangement; the ROTATION and PERSPECTIVE needed for the overhead view; and LIGHTING, shadow and reflection so it belongs in the scene.',
  '- You may NOT: redesign, restyle, recolour or re-texture a product; move, resize, re-typeset, recolour, add or remove a logo, wordmark, label or any printed artwork; change, correct or invent lettering; substitute a different product; or add any detail the reference does not show.',
  '- Do not "improve" anything. A mark that looks small, off-centre, low-contrast or unusual in a reference is CORRECT — it is the customer\u2019s own design, and reproducing it as-is is the whole task.',
  '- If a product\u2019s printing becomes too small to read at the size it ends up in the box, leave it exactly as it is. Never enlarge, simplify, redraw or re-letter artwork to make it legible.',
  '- Add nothing to any product that its reference does not already carry — no extra logo, no extra wording, no badge, no sticker, no label.',
  '- If you cannot place a product without altering it, place it smaller or turn it, but never change what is printed on it.',
].join('\n')

/**
 * In composition mode fidelity outranks everything, including the arrangement
 * and the scene — the opposite emphasis to a photoshoot.
 */
/**
 * The last word in plain mode, placed with the fidelity rules.
 *
 * The reproduce-exactly block is written for products that HAVE artwork and
 * spends most of its length on keeping it intact. For plain goods the operative
 * half is the short one — add nothing — so it is restated as its own check
 * rather than left as one clause in a long paragraph about preserving marks
 * that are not there.
 */
const KIT_UNBRANDED_CHECK_BLOCK =
  'BEFORE RETURNING THE IMAGE, look over every product in the frame and confirm that not one of them carries a logo, wordmark, brand name, monogram, slogan, label, badge or printed graphic that its own reference photograph does not already show. If any product has picked one up, remove it and return the corrected image. The same applies to the box, the filling and the background.'

const KIT_COMPOSE_PRIORITY_BLOCK =
  'PRIORITY — if any two rules conflict, obey the earlier one: (1) each product reproduced exactly as its reference, artwork and branding untouched, (2) the exact product set, (3) the box and filling matching their references, (4) the arrangement, (5) scene styling. A tidier composition is never worth altering a product.'

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

function kitProductSetBlock(
  productNames: string[],
  preBranded: string[] = [],
): string {
  const count = productNames.length
  if (!count) return ''
  const branded = new Set(preBranded)
  const lines = productNames.map(
    (n, i) => `${i + 1}. ${n}${branded.has(n) ? ' — ALREADY BRANDED' : ''}`,
  )

  const block = [
    `PRODUCT SET — the box contains EXACTLY these ${count} product${count === 1 ? '' : 's'}, one of each, and nothing else:`,
    ...lines,
  ]

  if (branded.size > 0) {
    block.push(
      '',
      'ALREADY BRANDED — the products marked above arrive with the logo on them, exactly where the customer placed it. For those products:',
      '- The logo is already correct. Reproduce it precisely as its reference image shows it: same face of the product, same position on that face, same size, same rotation, same colours.',
      '- Do NOT re-apply, move, re-centre, enlarge, shrink or redraw it, and do not judge a "better" spot for it. Its size and position are the customer\u2019s decision, and any size rule stated elsewhere in this brief does not apply to them.',
      '- Do NOT add a second copy of the logo anywhere on those products.',
      '- Everything else still holds: reproduce the product faithfully and light it to match the scene.',
    )
  }
  return block.join('\n')
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
function kitBrandingBlock(factsLines: string, allPreBranded = false): string {
  return [
    allPreBranded
      ? 'BRANDING — every product already carries the company logo (the final reference image is that same logo, at full quality, so you can reproduce it cleanly). Keep each mark exactly where and how its product reference shows it. Copy the artwork from that reference — never draw it from memory, never approximate it, never substitute a similar-looking or invented mark.'
      : 'BRANDING — essential: apply the company logo (the final reference image) to EVERY product in the box, as if each item were genuine branded corporate merchandise. Copy it from that reference image exactly — never draw it from memory, never approximate it, never substitute a similar-looking or invented mark.',
    allPreBranded
      ? '- Exactly one logo per product, as already printed on it. No item gains a second copy and none loses the one it has.'
      : '- Exactly one logo per product, printed, embossed or label-applied directly onto the item itself or onto its packaging. No item is left unbranded.',
    ...(factsLines ? [factsLines] : []),
    '- Reproduce the logo exactly as supplied: identical shapes, colours and proportions. The only permitted transformations are uniform scaling, perspective mapping onto the surface, and material/lighting integration.',
    '- ONE LINE ON EVERY PRODUCT: if the supplied logo is a single line of artwork, it is printed as a single line on every item in the box — the mug, the pen, the notebook, all of them. Never stack it, wrap it, break it across lines, or re-typeset it into a square or vertical block to make it fit.',
    '- When a one-line logo will not fit an item at a comfortable size, PRINT IT SMALLER until it does. Size is what you adjust to make it fit; the layout is not. A small, correct, one-line logo is right — a large stacked one is wrong. If it would become too small to read on a narrow item, move it to a wider face of that same item rather than changing its layout.',
    '- Same lockup on every product: icon and text keep their relative positions (an icon left of the text stays left of it, never above).',
    '- Same letterforms: exact spelling, capitalisation, letter spacing and weight. Never re-type it in another font and never add taglines or extra wording.',
    '- Same colours on every product by default: the original logo colours, exactly — never darkened, lightened, tinted or adapted per item. This holds even where the item\u2019s surface is close to the logo\u2019s own colour: print it as supplied and let it sit quietly rather than recolouring it.',
    '- Uniform scale only: never stretch, squash, crop, rotate or mirror it. If the logo does not fit a surface, print it SMALLER or use a wider face of that product — never reshape or re-stack it.',
    ...(allPreBranded
      ? [
          '- Do not choose a spot for any logo: every one is already placed. The position and size shown in each product reference are the customer\u2019s own decision and are reproduced as-is.',
        ]
      : []),
    ...(allPreBranded ? [] : ['- On each product, first identify what the item IS — from its name in the PRODUCT SET and from its reference image — then choose the OPTIMAL spot: where that product is branded in real life (centre chest of apparel, the upward-facing side of mugs and bottles, the front panel of bags, boxes and notebooks, the barrel of pens) — preferring the widest flat surface visible from above that fits the logo legibly without changing its layout, clear of seams, handles, edges and existing artwork. Centre the logo there with balanced margins.']),
    ...(allPreBranded
      ? []
      : [
          '- Apply the MARK SCALE rules below consistently across the whole set, so the logo reads as the same size relative to each item — proportionally smaller on small items, never larger on big ones. A set where one logo dominates its product is wrong even if each item looks fine on its own.',
        ]),
    "- Integrate it physically: correct perspective for the overhead view, wrapping with any curvature, matching each surface's finish, texture and lighting — printed on the product, never a flat sticker pasted onto the photograph.",
    '- If a product reference already shows this logo, keep that print as it is and do not add a second copy.',
    '- The logo goes on the products only — never on the box, the filling material or the background. If the BOX reference already carries printed artwork, keep it exactly as it is and do not add the logo to it.',
  ].join('\n')
}

function kitTextPolicyBlock(hasLogo: boolean, compositionOnly = false): string {
  if (compositionOnly) {
    return "TEXT POLICY: the only text and branding in the frame is what the product references, the box reference and the filling reference already carry. Reproduce those exactly and add nothing — no logo, brand name, slogan, label or caption that is not already in a reference image."
  }
  return `TEXT POLICY: apart from each product's own existing packaging artwork${
    hasLogo ? ' and the supplied company logo' : ''
  }, no other logo, brand name, slogan or text may appear anywhere in the frame.`
}

const KIT_OUTPUT_BLOCK =
  'OUTPUT: exactly ONE unified photograph of one box — never a grid of separate frames, a collage, a contact sheet, a mosaic or labelled panels.'

const KIT_PRIORITY_BLOCK =
  'PRIORITY — if any two rules conflict, obey the earlier one: (1) the exact product set, (2) product fidelity, (3) the box and filling matching their references, (4) logo fidelity, (5) logo scale — modest and consistent across the set, (6) scene styling.'

function kitFinalCheckBlock(
  hasLogo: boolean,
  allPreBranded = false,
  compositionOnly = false,
): string {
  if (compositionOnly) {
    return 'FINAL CHECK before returning the image: every listed product appears exactly once; each product is unmistakably the SAME item as its reference — same artwork, same logo, same lettering, in the same place on the item and at the same size relative to it, in the same colours; nothing has been redesigned, re-branded, re-lettered or added to any product; the box and filling match their references; the output is one single photograph of one box. Compare each product against its reference one at a time, and if any of them has been altered, redo it as a faithful copy.'
  }
  // The size clause is the one part that cannot survive a hand placement: it
  // asks the model to verify a proportion the customer already overrode. What
  // stays is everything about artwork integrity, which a placement says
  // nothing about.
  const logoChecks = allPreBranded
    ? '; every logo sits exactly where its product reference shows it, at that same size — none moved, re-centred, resized or added; a one-line logo is still on ONE line, with the SAME lockup and aspect ratio as the supplied image, and its original colours — or, where an item\u2019s surface matched the logo\u2019s colour, only the black/white parts swapped with every other colour untouched — clearly visible either way'
    : '; a one-line logo is printed on ONE line on every single product — check each item individually and, if any logo is stacked, wrapped or broken across lines, redo it smaller on one line; the logo on every product has the SAME lockup and aspect ratio as the supplied image, and its original colours — or, where an item\u2019s surface matched the logo\u2019s colour, only the black/white parts swapped with every other colour untouched — clearly visible either way; every logo spans about a quarter to a third of the face it sits on — never past 40% — and none crowds an edge; if a logo looks large, it is too large'

  return `FINAL CHECK before returning the image: every listed product appears exactly once${
    hasLogo ? logoChecks : ''
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
  // Which products still need the logo put on them, and which arrive wearing it.
  const preBranded = (options.preBranded ?? []).filter((name) =>
    productNames.includes(name),
  )
  const mode = kitBrandingMode(productNames, preBranded, options.noBranding)
  const allPreBranded = mode === 'preserve'

  // With nothing to brand, every branding rule below is not just redundant but
  // actively harmful — each one is an instruction to put a mark on a product
  // that either already has one or was never meant to. They all drop out
  // together with the logo attachment, and the reproduction contract takes
  // their place.
  const compositionOnly = mode !== 'apply'
  const hasLogo = Boolean(options.hasLogo) && !compositionOnly

  return [
    // The logo contract opens the prompt — models weight the first line most.
    hasLogo ? LOGO_PRIME_RULE : '',
    mode === 'unbranded'
      ? KIT_UNBRANDED_TASK_BLOCK
      : mode === 'mixed'
        ? KIT_MIXED_TASK_BLOCK
        : mode === 'preserve'
          ? KIT_COMPOSE_TASK_BLOCK
          : KIT_TASK_BLOCK,
    hasLogo ? kitLogoRecap(allPreBranded) : '',
    kitReferenceImagesBlock(count, {
      hasPackaging: Boolean(options.packaging),
      hasFilling: Boolean(options.filling),
      hasLogo,
      brand,
    }),
    kitProductSetBlock(productNames, mode === 'preserve' ? [] : preBranded),
    compositionOnly ? KIT_REPRODUCE_EXACTLY_BLOCK : KIT_PRODUCT_FIDELITY_BLOCK,
    mode === 'unbranded' || mode === 'mixed' ? KIT_UNBRANDED_CHECK_BLOCK : '',
    kitSceneBlock(options.packaging, options.filling),
    KIT_ARRANGEMENT_BLOCK,
    KIT_LIGHTING_BLOCK,
    hasLogo
      ? kitBrandingBlock(kitLogoFactsLines(options.logoFacts), allPreBranded)
      : '',
    hasLogo ? MARK_SCALE_BLOCK : '',
    hasLogo ? LOGO_ONE_LINE_BLOCK : '',
    hasLogo ? PRINT_TEXT_BLOCK : '',
    kitTextPolicyBlock(hasLogo, compositionOnly),
    KIT_OUTPUT_BLOCK,
    SINGLE_RENDER_BLOCK,
    compositionOnly ? KIT_COMPOSE_PRIORITY_BLOCK : KIT_PRIORITY_BLOCK,
    kitFinalCheckBlock(hasLogo, allPreBranded, compositionOnly),
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
    productSet: kitProductSetBlock(productNames, options.preBranded ?? []),
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
  KIT_LOGO_RECAP,
  '{{referenceImages}}',
  '{{productSet}}',
  KIT_PRODUCT_FIDELITY_BLOCK,
  '{{scene}}',
  KIT_ARRANGEMENT_BLOCK,
  KIT_LIGHTING_BLOCK,
  kitBrandingBlock('{{measuredLogoFacts}}'),
  MARK_SCALE_BLOCK,
  LOGO_ONE_LINE_BLOCK,
  PRINT_TEXT_BLOCK,
  kitTextPolicyBlock(true),
  KIT_OUTPUT_BLOCK,
  SINGLE_RENDER_BLOCK,
  KIT_PRIORITY_BLOCK,
  kitFinalCheckBlock(true),
].join('\n\n')
