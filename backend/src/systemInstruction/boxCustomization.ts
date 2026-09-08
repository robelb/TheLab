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
  placedTypefaceFacts,
  placementFacts,
  PLACEMENT_BLOCK,
  PLACEMENT_SCALE_BLOCK,
} from './placement.js'
import {
  BOX_FULL_BLEED_SCALE_BLOCK,
  BOX_PRINT_SCALE_BLOCK,
  LOGO_ONE_LINE_BLOCK,
  LOGO_ONE_LINE_PLACED_BLOCK,
  LOGO_PRIME_RULE,
  LOGO_PRIME_RULE_PLACED,
  PRINT_TEXT_BLOCK,
  SINGLE_RENDER_BLOCK,
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
  /**
   * The shopper placed the artwork themselves and the FIRST attachment is a
   * layout mockup rather than the plain box. Wins over `hasBase` — both claim
   * the edit-base slot, and the service resolves it the same way.
   */
  hasLayout?: boolean
  /** Per-layer placement lines from `describePlacement`. */
  placement?: string[]
  /** Wording the shopper typed into placed text layers, from `placedTextLayers`. */
  placedText?: string[]
  /**
   * The typeface each piece of placed wording must be set in, from
   * `placedTypefaces`. Separate from `placedText` because the wording contract
   * and the typeface contract fail in different ways: wording gets dropped or
   * reworded, a typeface gets quietly swapped for a generic sans.
   */
  placedFonts?: string[]
  /** The closed list of what was placed, from `placementInventory`. */
  inventory?: string
  /**
   * The layout places the brand logo itself, so the composite already carries
   * it and no logo is attached separately.
   *
   * Distinct from `hasLayout`: a layout may place only wording while the logo
   * is still supplied for the model to position. Saying "the logo is already
   * on the product" in that case would be a lie the model has no way to check.
   */
  logoPlaced?: boolean
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
 *
 * The vagueness licence is narrowed when the shopper placed wording of their
 * own. "Pick a typeface … that suits the occasion" is exactly right for a
 * one-line brief with nothing laid out, and is a direct contradiction of the
 * typeface they chose in the editor — and a model handed both a named face and
 * an invitation to choose one takes the invitation. A brief and a layout can
 * coexist ("something festive", logo dragged onto the lid), so this cannot
 * simply be left as it was.
 */
function interpretationBlock(hasPlacedText: boolean): string {
  return [
    'READING THE REQUEST — it is a shopper describing what they want, often briefly, with typos and half-formed ideas. Interpret it generously rather than literally:',
    '- Words that describe the job are instructions to you and NEVER appear on the box: "print", "write", "put", "add", "make", "on it", "on the lid", "across the front", "in gold". Print only the greeting or message itself.',
    '- Correct obvious misspellings and typos in anything you print, and set it with normal capitalisation for the occasion — a request typed as "marry chirsmas" is printed as "Merry Christmas", "happy bday sara" as "Happy Birthday Sara". The one exception is wording the shopper put in quotes: quoted text is reproduced exactly as written, typos and all.',
    hasPlacedText
      ? '- Where the request is vague, make the tasteful design decision yourself instead of leaving the box plain: pick the layout, palette and any supporting motifs that suit the occasion. The lettering is the exception — the shopper chose the typeface themselves and it is named below, so that one is not yours to pick.'
      : '- Where the request is vague, make the tasteful design decision yourself instead of leaving the box plain: pick a typeface, layout, palette and any supporting motifs that suit the occasion.',
    '- Where it names an occasion or theme, design for it properly — seasonal motifs, colours and mood that fit — while keeping any specified wording and the box itself exactly as instructed.',
    '- If a detail is genuinely ambiguous, choose the most conventional, giftable reading. Never render a question, a placeholder or lorem text on the box.',
  ].join('\n')
}

/**
 * Multiple boxes in one output is the box prompt's own duplication failure —
 * triggered above all in refine mode, where TWO box pictures go in (the
 * current design and the original reference) and the model renders both.
 */
const ONE_BOX_BLOCK = [
  'ONE BOX ONLY — the finished image contains exactly ONE gift box:',
  '- A single box, shown once, from one angle. All the reference images describe this one SAME box — they are never a request for several boxes.',
  '- Never render two boxes side by side, a row or stack of boxes, the same box at multiple angles or sizes, an open and a closed version together, or a small extra box in the background.',
  '- If a draft shows more than one box, it is wrong: redo it with exactly one.',
].join('\n')

export function buildBoxPrintPrompt(input: BuildBoxPrintPromptInput): string {
  const name = input.boxName.trim() || 'gift box'
  const request = input.request.trim()
  const wording = requestedText(request)
  const p: string[] = []

  // A layout takes the edit-base slot from a refine base — the two cannot both
  // be the first attachment, and re-applying a moved mark on top of a render
  // that already carries it produces two. Mirrors the service's precedence.
  const hasLayout = Boolean(input.hasLayout && input.placement?.length)
  // Wording the shopper placed by hand is wording they asked for. Without this
  // the standing "no wording that was not asked for" rule contradicts the
  // layout and reads as an instruction to delete what they just positioned.
  const placedText = (hasLayout ? input.placedText : undefined)?.filter(Boolean) ?? []
  const placedList = placedText.map((t) => `"${t}"`).join(' and ')

  // The logo contract opens the prompt — models weight the first line most.
  if (input.logoPlaced) p.push(LOGO_PRIME_RULE_PLACED)
  else if (input.hasBranding) p.push(LOGO_PRIME_RULE)

  if (hasLayout) {
    p.push(
      'Act as an expert packaging designer and commercial product photographer. You are given a rough layout mockup of a gift box with artwork pasted onto it. Produce ONE single, photorealistic photograph of that same box with that same artwork properly printed on it — one box, one frame. Never a grid, collage, contact sheet, set of angles, mockup sheet or split layout.',
    )
    const refs = [
      'Reference images, in the order provided:',
      '- The FIRST image is the layout mockup — this exact gift box with the artwork digitally pasted where the customer placed it. It is the base of your output and the authority on WHERE everything goes.',
      '- The SECOND image is the original box product photo, before anything was pasted on. It is ground truth for the box’s construction, proportions, material and stock colour — never a second box to render.',
    ]
    if (input.hasBranding) {
      refs.push(
        '- The FINAL image is the brand logo at full quality — the authority on what the mark LOOKS like, since the copy in the mockup is small and rough. Copy its artwork from here and its position from the mockup. It is never a picture to include on its own.',
      )
    }
    p.push(refs.join('\n'))
    p.push(
      'KEEP THE BOX ITSELF UNCHANGED. Same construction, same proportions, same lid and closure, same material and texture, same photographic angle. You are changing only what is PRINTED on its surface — do not redesign, reshape, resize or replace the box, and do not turn it into a different style of packaging. Its printed colour may change where the SURFACE rules below allow it; its shape never does.',
    )
  } else if (input.hasBase) {
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

  p.push(ONE_BOX_BLOCK)

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
    p.push(interpretationBlock(placedText.length > 0))
  } else if (input.hasBranding && placedText.length === 0) {
    p.push(
      'The shopper asked for the brand logo on the box and nothing else: a clean, understated branded box with no wording, motifs, patterns or decoration beyond the logo itself.',
    )
  } else if (input.hasBase) {
    p.push(
      'The shopper asked to take the brand logo off the box. Remove it and any lettering that came with it, and leave the rest of the design — colours, motifs and layout — exactly as it is.',
    )
  } else if (placedText.length > 0) {
    p.push(
      'The shopper gave no written brief — they placed what they wanted on the box directly. Print exactly that and nothing more: no extra motifs, patterns or decoration beyond a tasteful setting of the placed elements.',
    )
  } else {
    p.push(
      'The shopper gave no direction: leave the box plain, exactly as the reference shows it, with no artwork, wording or decoration added.',
    )
  }

  if (placedText.length > 0) {
    p.push(
      `PLACED WORDING — the shopper typed ${placedList} and positioned it themselves in the layout mockup. It is asked for and it stays. Print it character for character as given, keeping their spelling and capitalisation, set as real print rather than as a copy of the mockup's placeholder lettering — in the typeface class named for it below, which the shopper chose. Never omit it, reword it, translate it or duplicate it.`,
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
  } else if (placedText.length > 0) {
    p.push(
      `Beyond the placed wording ${placedList}, do not add any words, taglines, URLs or placeholder text that were not asked for.`,
    )
  } else {
    p.push(
      'Do not add any words, taglines, URLs or placeholder text that were not asked for.',
    )
  }

  p.push(PRINT_TEXT_BLOCK)

  // The house scale rules and an explicit placement are mutually exclusive —
  // see the comment at the top of `placement.ts`. One or the other, never both.
  if (hasLayout) {
    p.push(PLACEMENT_BLOCK)
    p.push(placementFacts(input.placement ?? []))
    // The closed list goes straight after the positive instructions: those say
    // what to draw, this says that the list is finished.
    if (input.inventory) p.push(input.inventory)
    // The typeface the shopper chose, under its own heading. It belongs with
    // the other placement facts rather than up beside the wording, because it
    // is the same kind of statement: something the customer decided that the
    // render has to honour.
    if (input.placedFonts && input.placedFonts.length > 0) {
      p.push(placedTypefaceFacts(input.placedFonts))
    }
    p.push(PLACEMENT_SCALE_BLOCK)
  } else {
    p.push(
      capability.fullSurface
        ? BOX_FULL_BLEED_SCALE_BLOCK
        : BOX_PRINT_SCALE_BLOCK,
    )
  }

  p.push(
    'Make the print look genuinely applied to the box — following the surface, its perspective and any folds or edges, with the material texture showing through and lighting consistent with the photograph. It should read as a real printed box, not a flat sticker or a digital overlay pasted on top.',
  )

  if (input.logoPlaced) {
    // The mockup already carries the logo. "Applying it is part of the task"
    // is then an instruction to add a second one — which is exactly what the
    // model does when handed both a branded mockup and a loose logo file.
    p.push(
      [
        "BRANDING — the brand's logo is ALREADY on the box. The layout mockup shows it in place, exactly where the shopper put it. Render that one faithfully; never add one.",
        '- Do not apply, place or position the logo — that has happened. Work on the copy already in the mockup so it reads as genuinely printed on the board: sharp, undistorted, following the surface and its lighting.',
        '- No separate logo file is supplied, because none is needed: the mockup is the only source for this mark. Copy it faithfully from there — same artwork, same proportions, same colours — and never draw it from memory, never approximate it, never substitute a similar-looking or invented mark.',
        '- Exactly ONE logo appears on the finished box, in the one place the mockup shows it. Not a second copy on the lid, the front, a side, an edge or the background. If your draft shows the logo more than once, keep the one the mockup placed and remove every other.',
        '- It is the only brand allowed in the image; remove or replace any other, different, placeholder or made-up logo, brand name or wordmark. Never redraw, restyle or add text to it, and keep its original colours exactly as supplied.',
      ].join('\n'),
    )
    p.push(LOGO_ONE_LINE_PLACED_BLOCK)
  } else if (input.hasBranding) {
    p.push(
      "BRANDING — the FINAL reference image is the brand's logo, and it MUST appear on the box: applying it is part of the task, never optional, never skipped, and never postponed. Copy it from that reference image exactly — never draw it from memory, never approximate it, and never substitute a similar-looking or invented mark; the reference is the only source of what this logo looks like. Apply it sharp and undistorted, and keep it small — roughly a quarter of the width of the face, clearly separated from the requested design and never competing with it. It is the only brand allowed in the image; remove or replace any other, different, placeholder or made-up logo, brand name or wordmark. Never redraw, restyle or add text to it, and keep its original colours exactly as supplied.",
    )
    p.push(LOGO_ONE_LINE_BLOCK)
  }

  p.push(
    `Frame the ${name} as the single hero of the shot, entirely inside the frame with comfortable margins — never cropped or cut off. Clean studio lighting on an uncluttered background. Square 1:1 image.`,
  )

  p.push(SINGLE_RENDER_BLOCK)

  p.push(
    'Avoid: multiple images, grids, collages or variations; more than one box; a cropped or distorted box; warped, misspelled or illegible text; text broken onto extra lines; ' +
      (hasLayout
        ? 'artwork moved, resized or re-centred away from the layout mockup; a pasted-on, unlit or cut-out look; '
        : 'an oversized logo; ') +
      'extra logos or decoration nobody asked for; and flat, cheap, obvious-mockup looks.' +
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
      : placedText.length > 0
        ? `the placed wording ${placedList} IS on the box, reading exactly as written, and no other wording appears`
        : 'no wording appears that was not asked for'

  // A requested logo is verified as PRESENT and faithful; without one, the box
  // must carry no brand at all — an invented mark is the failure being pinned.
  const logoSizeCheck = hasLayout
    ? 'at the position and size the layout mockup shows'
    : 'small'
  const logoCheck = input.logoPlaced
    ? `the brand logo IS on the box — exactly once, in the one place the layout mockup put it, at that size, matching the mockup exactly (never redrawn, approximated or invented), on one line, and clearly visible in its original colours or with only its black/white parts swapped where the surface matched its colour`
    : input.hasBranding
    ? `the brand logo from the FINAL reference image IS on the box — exactly once, matching that reference exactly (never redrawn, approximated or invented), ${logoSizeCheck}, on one line, and clearly visible in its original colours or with only its black/white parts swapped where the surface matched its colour`
    : 'no logo, brand name or wordmark appears anywhere on the box'

  // Only meaningful with a mockup to compare against; appended as (6) so the
  // established numbering of (1)–(5) stays stable.
  const placementCheck = hasLayout
    ? '; (6) every element is where the layout mockup put it, at the size shown, and reads as genuinely printed on the material rather than pasted on top'
    : ''

  p.push(
    `FINAL CHECK before returning the image: (1) it is the same box as the reference — same construction, proportions and angle; (2) ${wordingCheck}; (3) ${
      capability.fullSurface
        ? 'the printed colour covers the whole box with no unprinted white or kraft showing at the edges or sides'
        : hasLayout
          ? `every unprinted area is still ${color ?? 'the box’s own stock colour'}`
          : `every unprinted area is still ${color ?? 'the box’s own stock colour'}, and the design sits within a clear unprinted margin without bleeding off the edges`
    }; (4) ${logoCheck}; (5) exactly ONE box appears, in one single photograph${placementCheck}. If a check fails, correct it and return the corrected image.`,
  )

  return p.join('\n\n')
}
