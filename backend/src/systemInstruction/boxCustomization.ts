/**
 * Prompt system for printing a design onto a gift box.
 *
 * Different job from `productPhotoshoot`: there the product is staged in a
 * scene and must not change. Here the box IS the thing being changed — we keep
 * its construction exactly (shape, proportions, closure, material) and alter
 * only its printed surface. So the brief leans hard on "same box, new print",
 * and on getting requested text spelled correctly, which is where image models
 * fail most often.
 *
 * The box's own catalogue copy is passed in as fact, because it states what the
 * box actually is — "34 x 25 x 10 cm", "FSC-Mix certified cardboard",
 * "available in natural or white", "print on the lid and front". That keeps the
 * model from inventing a different box or printing somewhere impossible.
 */

/** Base colours the supplier offers, scanned out of the catalogue copy. */
import {
  BOX_FULL_BLEED_SCALE_BLOCK,
  BOX_PRINT_SCALE_BLOCK,
  LOGO_CONTRAST_BLOCK,
  LOGO_ONE_LINE_BLOCK,
  LOGO_PRIME_RULE,
  PRINT_TEXT_BLOCK,
} from './printScale.js'

const KNOWN_COLORS = [
  'natural',
  'white',
  'black',
  'kraft',
  'brown',
  'natur',
  'weiß',
  'schwarz',
] as const

const COLOR_ALIASES: Record<string, string> = {
  natur: 'natural',
  weiß: 'white',
  schwarz: 'black',
}

/**
 * Which base colours this box comes in, read out of its description. A
 * heuristic over supplier prose, so it is only ever used to offer choices —
 * never to reject one.
 */
export function boxColorOptions(description: string): string[] {
  const text = description.toLowerCase()
  const found = new Set<string>()
  for (const color of KNOWN_COLORS) {
    if (new RegExp(`\\b${color}\\b`).test(text)) {
      found.add(COLOR_ALIASES[color] ?? color)
    }
  }
  return [...found]
}

/**
 * How this box is decorated, which differs per product and changes the brief
 * completely:
 *
 *   - Full Colour Box — printed edge to edge. The box's colour IS the design,
 *     so artwork bleeds off the edges and a background colour is legitimate.
 *   - Eco Box white / natur — supplied as fixed white or natural board and
 *     printed onto. The stock colour is the background and must survive.
 *   - Magnetbox — same, but the supplier only prints the lid and front.
 *
 * Read from the supplier's own copy, which states each of these.
 */
export interface BoxPrintCapability {
  /** The whole box can be printed — background colour and full-bleed artwork. */
  fullSurface: boolean
  /** Faces the supplier prints; empty means the main visible faces. */
  faces: string[]
}

export function boxPrintCapability(
  name: string,
  description?: string | null,
): BoxPrintCapability {
  const text = `${name} ${description ?? ''}`.toLowerCase()
  const fullSurface = /full[- ]colou?r/.test(text)

  const faces: string[] = []
  if (!fullSurface) {
    if (/\blid\b/.test(text)) faces.push('the lid')
    if (/\bfront\b/.test(text)) faces.push('the front')
  }
  return { fullSurface, faces }
}

export interface BuildBoxPrintPromptInput {
  boxName: string
  /** The supplier's own description — dimensions, material, print positions. */
  boxDescription?: string | null
  boxDetails?: string[]
  /** Base colour of the box stock, when the shopper picked one. */
  color?: string | null
  /** What the shopper wants printed, in their words. */
  request: string
  /** A logo/mark to apply alongside the requested artwork. */
  hasBranding: boolean
  /** True when iterating on a previously generated box image. */
  hasBase?: boolean
}

/**
 * The wording a shopper wants on the box, and how literally to take it.
 *
 * Quoting is the signal. `write "Merry Christmas"` is a character-for-character
 * instruction — the shopper chose those exact letters, so an unconventional
 * spelling or a brand name survives. `and write marry chirsmas on it` is a
 * description of intent typed in a hurry: it needs the trailing placement words
 * stripped and its spelling normalised, or the box comes back reading
 * "marry chirsmas on it".
 */
interface RequestedText {
  value: string
  /** The shopper quoted it — reproduce exactly, typos included. */
  verbatim: boolean
}

/**
 * Strip trailing placement words: "on it", "on the lid", "across the front of
 * the box".
 *
 * The target noun is whitelisted to parts of a box rather than any noun,
 * because a greeting can legitimately end in a prepositional phrase —
 * "welcome to the team" must survive, while "… across the front of the box"
 * must not. Runs repeatedly to unwind chains.
 */
const PLACEMENT_TAIL =
  /\s+(?:on|onto|across|over|along|around|at|in|to|of|for)\s+(?:the\s+|its\s+)?(?:box\s+)?(?:it|them|there|box|lid|top|front|cover|side|sides|surface|package|packaging)\s*$/i

function stripPlacementWords(phrase: string): string {
  let out = phrase.trim().replace(/[.!?,;:]+$/, '').trim()
  let previous: string
  do {
    previous = out
    out = out.replace(PLACEMENT_TAIL, '').trim()
  } while (out !== previous && out.length > 0)
  return out
}

function requestedText(request: string): RequestedText | null {
  const quoted = [...request.matchAll(/["“”'‘’](.+?)["“”'‘’]/g)]
    .map((m) => m[1].trim())
    .filter(Boolean)
  if (quoted.length > 0) {
    return { value: quoted.join('" / "'), verbatim: true }
  }

  const after =
    /(?:print|say|says|write|writes|text|reads?|wording|saying)\s*:?\s+(.{2,80})$/i.exec(
      request.trim(),
    )
  if (!after) return null

  const value = stripPlacementWords(after[1])
  return value.length >= 2 ? { value, verbatim: false } : null
}

/**
 * Shoppers type quickly and describe things loosely. Read for intent — this is
 * what stops a request reaching the box as literal instruction text.
 */
const INTERPRETATION_BLOCK = [
  'READING THE REQUEST — it is a shopper describing what they want, often briefly, with typos and half-formed ideas. Interpret it generously rather than literally:',
  '- Words that describe the job are instructions to you and NEVER appear on the box: "print", "write", "put", "add", "make", "on it", "on the lid", "across the front", "in gold". Print only the greeting or message itself.',
  '- Correct obvious misspellings and typos in anything you print, and set it with normal capitalisation for the occasion — a request typed as "marry chirsmas" is printed as "Merry Christmas", "happy bday sara" as "Happy Birthday Sara". The one exception is wording the shopper put in quotes: quoted text is reproduced exactly as written, typos and all.',
  '- Where the request is vague, make the tasteful design decision yourself instead of leaving the box plain: pick a typeface, layout, palette and any supporting motifs that suit the occasion.',
  '- Where it names an occasion or theme, design for it properly — seasonal motifs, colours and mood that fit — while keeping any specified wording and the box itself exactly as instructed.',
  '- If a detail is genuinely ambiguous, choose the most conventional, giftable reading. Never render a question, a placeholder or lorem text on the box.',
].join('\n')

export function buildBoxPrintPrompt(input: BuildBoxPrintPromptInput): string {
  const name = input.boxName.trim() || 'gift box'
  const request = input.request.trim()
  const wording = requestedText(request)
  const p: string[] = []

  // The logo contract opens the prompt — models weight the first line most.
  if (input.hasBranding) p.push(LOGO_PRIME_RULE)

  if (input.hasBase) {
    p.push(
      'Act as an expert packaging retoucher. Apply the requested change to the current design and keep everything else identical — the same box, construction, colour, camera angle, lighting and background. Produce ONE single photograph, never a grid, collage or set of variations.',
    )
    // Every attachment is named by position — an undescribed reference image
    // is an invitation to misread it as something to render.
    const refs = [
      'Reference images, in the order provided:',
      '- The FIRST image is the current customised gift box — the photograph you are editing. Your output is this image with only the requested change applied.',
      '- The SECOND image is the original box product photo. It is ground truth for the box’s construction, proportions, material and stock colour — never a second box to render.',
    ]
    if (input.hasBranding) {
      refs.push(
        '- The FINAL image is the brand logo — artwork to apply, never a picture to include on its own.',
      )
    }
    p.push(refs.join('\n'))
  } else {
    p.push(
      'Act as an expert packaging designer and commercial product photographer. Produce ONE single, photorealistic photograph of the given gift box with a new printed design on it — one box, one frame. Never a grid, collage, contact sheet, set of angles, mockup sheet or split layout.',
    )
    const refs = [
      'Reference images, in the order provided:',
      '- The FIRST image is the exact gift box to customise — the base of your output.',
    ]
    if (input.hasBranding) {
      refs.push(
        '- The FINAL image is the brand logo — artwork to print onto the box, never a picture to include on its own.',
      )
    }
    p.push(refs.join('\n'))
    p.push(
      'KEEP THE BOX ITSELF UNCHANGED. Same construction, same proportions, same lid and closure, same material and texture, same photographic angle. You are changing only what is PRINTED on its surface — do not redesign, reshape, resize or replace the box, and do not turn it into a different style of packaging. Its printed colour may change where the SURFACE rules below allow it; its shape never does.',
    )
  }

  // ── Facts about this specific box, straight from the supplier.
  const facts: string[] = [`This box is the "${name}".`]
  if (input.boxDescription?.trim()) facts.push(input.boxDescription.trim())
  if (input.boxDetails?.length) facts.push(input.boxDetails.join('. ') + '.')
  p.push(
    `Facts about the box (treat as ground truth — respect its real dimensions, material and the surfaces it can be printed on):\n${facts.join(
      ' ',
    )}`,
  )

  // ── How this box is decorated. The two cases contradict each other, so the
  //    prompt states exactly one of them.
  const capability = boxPrintCapability(name, input.boxDescription)
  const color = input.color?.trim()

  if (capability.fullSurface) {
    const surface = [
      'SURFACE — this box is printed in full colour over its entire surface. The colour of the box IS part of the design, not a fixed background you have to preserve:',
      color
        ? `- Print the box ${color}: carry that colour across the lid, the edges and every visible side, edge to edge.`
        : '- If the request names or implies a colour or a pattern, carry it across the whole box, edge to edge. If it names none, choose one that suits the request and apply it across the whole box — do not default to leaving the board white or kraft.',
      '- The board underneath is white cardboard, but on this box it is fully covered by print. Do not leave unprinted white or brown borders, edges or side panels.',
      '- Keep the printed surface flat and even, with the slight texture of the board showing through, lit as a real printed box.',
    ]
    p.push(surface.join('\n'))
  } else {
    const stock = color ? `${color} board` : 'its supplied stock colour'
    const surface = [
      `SURFACE — this box is supplied as ${stock} and is decorated by printing onto it. The stock colour is the background and must survive:`,
      `- Keep every unprinted area in ${color ?? 'the box’s own stock colour'}, with the natural texture of the material showing through. Do not repaint, tint, wrap or recolour the box itself, and do not turn it into a full-colour printed box.`,
      capability.faces.length > 0
        ? `- The supplier prints only ${capability.faces.join(' and ')} of this box. Put the design there and leave every other face plain and unprinted.`
        : '- Print on the main faces facing the camera. Leave the remaining faces plain and unprinted.',
      `- If the request asks for a box in another colour, this box is not supplied in it. Keep the ${color ?? 'stock'} board and carry the requested colour through the printed artwork instead — coloured lettering, motifs or a printed panel — rather than repainting the box.`,
    ]
    p.push(surface.join('\n'))
  }

  // ── What to print. The raw request comes first so the model sees the whole
  //    idea, then the reading rules tell it how to take it. An empty request is
  //    legitimate: toggling the logo on or off is a complete instruction.
  if (request) {
    p.push(`What the shopper asked for, in their own words: ${request}`)
    p.push(INTERPRETATION_BLOCK)
  } else if (input.hasBranding) {
    p.push(
      'The shopper asked for the brand logo on the box and nothing else: a clean, understated branded box with no wording, motifs, patterns or decoration beyond the logo itself.',
    )
  } else if (input.hasBase) {
    p.push(
      'The shopper asked to take the brand logo off the box. Remove it and any lettering that came with it, and leave the rest of the design — colours, motifs and layout — exactly as it is.',
    )
  } else {
    p.push(
      'The shopper gave no direction: leave the box plain, exactly as the reference shows it, with no artwork, wording or decoration added.',
    )
  }

  if (wording?.verbatim) {
    p.push(
      `TEXT MUST BE PERFECT. The shopper quoted this wording, so the box must read exactly "${wording.value}" — character for character, keeping their spelling, spacing, accents and capitalisation even where unconventional. No invented, duplicated, misspelled or reversed words anywhere on the box. If you cannot render it cleanly, render it smaller and simpler rather than distorted. Do not add any other words, taglines, addresses, URLs or placeholder text.`,
    )
  } else if (wording) {
    p.push(
      `TEXT MUST BE PERFECT. The shopper described the wording as "${wording.value}" — that is a description typed quickly, not a spelling to copy. Print the message they clearly meant, correctly spelled and capitalised for the occasion. Set that message and nothing else: no instruction words, no duplicates, no taglines, addresses, URLs or placeholder text.`,
    )
  } else {
    p.push(
      'Do not add any words, taglines, URLs or placeholder text that were not asked for.',
    )
  }

  p.push(PRINT_TEXT_BLOCK)
  p.push(
    capability.fullSurface
      ? BOX_FULL_BLEED_SCALE_BLOCK
      : BOX_PRINT_SCALE_BLOCK,
  )

  p.push(
    'Make the print look genuinely applied to the box — following the surface, its perspective and any folds or edges, with the material texture showing through and lighting consistent with the photograph. It should read as a real printed box, not a flat sticker or a digital overlay pasted on top.',
  )

  if (input.hasBranding) {
    p.push(
      "BRANDING — the FINAL reference image is the brand's logo. Apply it to the box exactly as given: sharp, correctly coloured and undistorted. Keep it small — roughly a quarter of the width of the face, clearly separated from the requested design and never competing with it. It is the only brand allowed in the image; remove or replace any other, different, placeholder or made-up logo, brand name or wordmark. Never redraw, restyle or add text to it, and keep its original colours except where the LOGO CONTRAST rule applies.",
    )
    p.push(LOGO_ONE_LINE_BLOCK)
    p.push(LOGO_CONTRAST_BLOCK)
  }

  p.push(
    `Frame the ${name} as the single hero of the shot, entirely inside the frame with comfortable margins — never cropped or cut off. Clean studio lighting on an uncluttered background. Square 1:1 image.`,
  )

  p.push(
    'Avoid: multiple images, grids, collages or variations; more than one box; a cropped or distorted box; warped, misspelled or illegible text; text broken onto extra lines; an oversized logo; extra logos or decoration nobody asked for; and flat, cheap, obvious-mockup looks.' +
      (capability.fullSurface
        ? ' Also avoid leaving any part of this box unprinted — no white or kraft borders, edges or side panels.'
        : ' Also avoid artwork bleeding off the edges or wrapping the corners, and avoid recolouring the box itself.'),
  )

  // The wording check must match the wording contract above — a verbatim quote
  // is verified against its exact characters, a described intent against the
  // corrected message; demanding "exactly as asked" for a typo'd description
  // would order the typo back in.
  const wordingCheck = wording?.verbatim
    ? `any wording reads exactly "${wording.value}", character for character, set on one line unless it was too long to be`
    : wording
      ? 'the wording is the corrected, properly spelled and capitalised message the shopper meant — no typos, no instruction words — set on one line unless it was too long to be'
      : 'no wording appears that was not asked for'

  p.push(
    `FINAL CHECK before returning the image: (1) it is the same box as the reference — same construction, proportions and angle; (2) ${wordingCheck}; (3) ${
      capability.fullSurface
        ? 'the printed colour covers the whole box with no unprinted white or kraft showing at the edges or sides'
        : `every unprinted area is still ${color ?? 'the box’s own stock colour'}, and the design sits within a clear unprinted margin without bleeding off the edges`
    }; (4) any logo is small, on one line, and clearly visible — in its original colours, or all-white/all-black where the surface matched its colour; (5) one box, one photograph. If a check fails, correct it and return the corrected image.`,
  )

  return p.join('\n\n')
}
