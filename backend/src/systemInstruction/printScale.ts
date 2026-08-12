/**
 * Shared scale and typography rules for every prompt that prints a mark onto a
 * product or a box.
 *
 * Why this exists: image models default to filling the available surface. Told
 * only to make a logo "clearly legible", they render it spanning the whole
 * face, which reads as a cheap mockup rather than real branded merchandise.
 * Adjectives ("tasteful", "proportionate") barely move them — explicit
 * fractions do. So the rules below are stated as numbers, with a single
 * tie-break direction: when unsure, smaller.
 *
 * These blocks are shared so the same numbers apply everywhere. A logo should
 * not be a third of a mug in one render and half a tote in the next.
 */

/**
 * The very first thing every logo-bearing prompt says, before the task itself.
 * Models weight the opening of a prompt heavily, and the single worst logo
 * failure is re-typesetting a one-line mark into a stacked block — so the
 * non-negotiable contract goes first: the logo is used as-is, shrinking is the
 * only permitted change.
 */
export const LOGO_PRIME_RULE =
  'FIRST, THE LOGO RULE — before anything else: use the supplied brand logo exactly AS IT IS, copied from its reference image — never drawn from memory, never approximated, never replaced with a similar-looking or invented mark. You are free to make it SMALLER — shrink it as much as needed to fit a surface — but you may not change its artwork: never redraw, restyle, stretch, crop or re-typeset it, and NEVER turn a single-line logo into two or more lines. Keep its original colours, with ONE exception: where the logo would disappear against a surface of nearly its own colour, swap ONLY its black and white parts for the opposite — black becomes white on dark surfaces, white becomes black on light ones — while every other colour in the logo stays exactly as supplied. If the logo does not fit somewhere, it becomes smaller; its artwork and layout never change.'

/**
 * What to do when the logo's own colours vanish against the surface it sits
 * on — a dark logo on a black product, a white mark on white board. The only
 * permitted change is swapping the logo's black and white parts for each
 * other; any accent colours in the mark are untouchable.
 */
export const LOGO_CONTRAST_BLOCK = [
  'LOGO CONTRAST — the logo must stay clearly visible against whatever it sits on:',
  '- Default: print the logo in its original colours, exactly as supplied. Use them whenever they read clearly against the chosen surface.',
  '- If the surface is the same or nearly the same colour as part of the logo — a black wordmark on a dark product, white lettering on white material — do what a real print shop does: swap ONLY the logo\u2019s black and white parts for the opposite, so black becomes white on a dark surface and white becomes black on a light one.',
  '- Every OTHER colour in the logo stays exactly as supplied. Accent colours, coloured icons and coloured lettering never change, never invert and never disappear. A logo that is entirely black or entirely white simply flips whole to the other.',
  '- Nothing else changes: never introduce a new colour, never force contrast with outlines, glows, drop shadows or a backing panel, and never alter the logo\u2019s shape, layout or line count — only the black/white fills swap.',
].join('\n')

/**
 * The duplication contract. Image models fill spare canvas by repeating the
 * subject — a second product in the background, a mirrored twin, a tiled row.
 * Stated once, shared by all four prompts, and phrased per-item so it also
 * holds for the kit photo where several DIFFERENT products are each rendered
 * once.
 */
export const SINGLE_RENDER_BLOCK = [
  'SINGLE RENDER — one of everything, one scene, the given dimensions:',
  '- Every product and subject appears exactly ONCE. Never duplicate, repeat, mirror, tile or echo an item anywhere in the frame — no second copy in the background, no rows or patterns of the same item, no before/after pairs, no angle or size variants, no thumbnails.',
  '- The output is ONE continuous scene that fills the whole canvas at the requested dimensions. When the canvas is wider or taller than the subject needs, extend the background to fill the space — never fill it by repeating the product.',
  '- If a draft shows the same item more than once, it is wrong: redo it with a single copy.',
].join('\n')

/**
 * How big a printed brand mark may be. Used wherever a logo goes onto a
 * product — onboarding branding, the bundle photo, the product photoshoot.
 */
export const MARK_SCALE_BLOCK = [
  'MARK SCALE — the printed mark is a small accent on the product, not a headline. Real branded merchandise is understated:',
  '- Width: the mark spans roughly one quarter to one third of the width of the face it sits on. It must never exceed 40% of that width, and must never run edge to edge.',
  '- Clear space: leave at least 15% of the face free on the left and right of the mark, and comparable space above and below. If the mark touches, crowds or nearly reaches an edge, it is too big — scale it down.',
  '- Small or narrow items (a pen barrel, keyring, cable, lid rim, bottle collar): smaller still — the mark takes up at most half the height of the narrow band it sits in.',
  '- Legibility floor: at that size the mark must still read cleanly. If it cannot, move it to a wider, flatter face — never grow it past the limits above to make it readable, and never simplify or redraw it.',
  '- When the right size is unclear, choose the smaller one. An oversized print is a worse error than a modest one.',
].join('\n')

/**
 * Typography discipline for any wording rendered onto a surface — a wordmark,
 * a company name, or a message a shopper asked for.
 */
export const PRINT_TEXT_BLOCK = [
  'TEXT LAYOUT:',
  '- Set wording on ONE single line. This is the default and it holds unless the text genuinely cannot work that way.',
  '- Only break to a second line when the wording is long (roughly more than 20 characters) or has an obvious two-part structure. Break at a word boundary, keep the lines close in length, and never use more than two lines.',
  '- Never letter-space, stretch, condense or scale wording to fill the width of a surface. Set it at a natural weight and let the empty space remain.',
  '- Never introduce a line break that is not present in the supplied artwork.',
].join('\n')

/**
 * The single most common failure: a one-line wordmark gets re-typeset onto two
 * or three stacked lines so it can be rendered large on a small surface. The
 * fix the model needs spelled out is that SIZE is the variable and LAYOUT is
 * not — shrink the mark until it fits on one line, every time.
 */
export const LOGO_ONE_LINE_BLOCK = [
  'LOGO STAYS ON ONE LINE — this is a hard constraint, on every product, on the box, and on anything else the logo appears on:',
  '- If the supplied logo is a single line of artwork, the printed logo is a single line of artwork. Never stack it, wrap it, break it across lines, split an icon above its text, or re-typeset it into a square or vertical block.',
  '- When a one-line logo will not fit a surface at a comfortable size, make it SMALLER until it fits on one line. Size is the thing you adjust; the layout is not. A small, correct, one-line logo is right; a large re-stacked one is wrong.',
  '- Keep shrinking rather than restacking even on narrow surfaces — a pen barrel, a bottle collar, a lid edge, a cable wrap. If it becomes too small to read there, move it to a wider face on the same item instead of changing its layout.',
  '- The same rule applies to every item in a single image. Do not stack the logo on the small products and keep it on one line on the big ones — they all keep the supplied layout, at whatever size each surface allows.',
].join('\n')

/**
 * Scale for a design printed onto a box supplied as fixed-colour board — the
 * Eco Boxes and the Magnetbox. The stock colour is the background and survives;
 * artwork sits on it inside real print margins. More generous than
 * `MARK_SCALE_BLOCK` because a birthday message on a lid is the point of the
 * box, whereas a logo on a mug is an accent.
 */
export const BOX_PRINT_SCALE_BLOCK = [
  'PRINT SCALE — the design is the feature of the printed face, but it is still artwork applied to board, with real margins:',
  '- The design occupies roughly half to two thirds of the width of the face it sits on, centred, with a clear unprinted border of at least 12% of that width on every side. Never bleed off the edges or wrap around a corner.',
  '- A logo included alongside the design stays small — about a quarter of the width of the face, clearly separated from the wording, never competing with it.',
  '- Keep the rest of the box clean. Do not fill empty faces with extra artwork, patterns, borders or repeated motifs that were not asked for.',
  '- When the right size is unclear, choose the smaller one.',
].join('\n')

/**
 * Scale for a box printed edge to edge, where the colour of the box is itself
 * part of the artwork. The margin rules above would be actively wrong here —
 * a full-colour box that keeps a white border is a failed render.
 */
export const BOX_FULL_BLEED_SCALE_BLOCK = [
  'PRINT SCALE — this box is printed edge to edge, so the artwork covers it rather than sitting on it:',
  '- Background colour and any pattern run full bleed: across the lid, over the edges, down every visible side, with no unprinted border and no white or kraft strip left showing. A pale, unprinted-looking box is a failed render.',
  '- Wording and any focal graphic still sit centred within the printed field, occupying roughly half to two thirds of the width of the face, with breathing room around them. Full bleed applies to the background, not to the lettering.',
  '- A logo included alongside the design stays small — about a quarter of the width of the face — and in a colour that stays legible against the printed background.',
  '- Keep it coherent: one colour scheme carried across the whole box, not a different treatment per face.',
].join('\n')
