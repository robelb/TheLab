/**
 * Rules for the case where the shopper placed the artwork themselves.
 *
 * Everywhere else in this system, geometry is specified in prose — "roughly a
 * quarter of the width of the face", "a clear unprinted border of at least
 * 12%" — because words were the only channel available. When a layout exists
 * that channel is obsolete: the shopper dragged the mark to a spot and the
 * first attachment is a mockup showing exactly where. Pixels beat adjectives,
 * and the model's job narrows from "decide where this goes" to "make what is
 * already there look printed".
 *
 * That makes `PLACEMENT_SCALE_BLOCK` a REPLACEMENT for the usual scale blocks
 * (`MARK_SCALE_BLOCK`, `BOX_PRINT_SCALE_BLOCK`, `BOX_FULL_BLEED_SCALE_BLOCK`),
 * never an addition to them. A shopper who deliberately drags a logo to 55% of
 * the lid is in flat contradiction with "never exceed 40%", and a model handed
 * both instructions splits the difference — which reads to the shopper as the
 * editor simply not working. `audit-prompts.ts` asserts the caps are absent
 * from every layout-bearing prompt.
 *
 * What survives from the old rules is everything about artwork INTEGRITY —
 * `LOGO_PRIME_RULE` and `LOGO_ONE_LINE_BLOCK`. Those govern what the mark may
 * look like, not how big it is, and a placement decision says nothing about
 * whether a one-line wordmark may be restacked. It may not.
 */

/**
 * What the layout mockup is and how to treat it. The failure being pinned here
 * is the model reading a flat paste-up as the finished look and returning it
 * barely changed — or, at the other extreme, treating the paste as a rough
 * suggestion and "improving" the composition.
 */
export const PLACEMENT_BLOCK = [
  'PLACEMENT IS ALREADY DECIDED — the first image is a layout mockup. The artwork has been digitally pasted onto the product at the exact position, size and angle the customer chose:',
  '- Those coordinates are the customer’s decision, not a draft for you to refine. Reproduce the placement as shown: same spot, same proportion of the surface, same tilt. Never re-centre it, never move it to a face you consider better balanced, never scale it up or down to suit the composition.',
  '- The paste is crude and the finish is your job. Make the artwork look genuinely printed on the material: following the surface and its perspective, bending over folds, curves and edges, taking on the texture of the board or fabric beneath it, and lit by the same light as the rest of the photograph.',
  '- Remove every trace of the mockup itself — hard cut-out edges, a flat unlit look, visible rectangular seams, any halo or background patch carried in with the pasted artwork. The finished image must read as a photograph of a printed product, never as a photograph with something laid on top.',
  '- The mockup shows placement only. It is not a guide to the print quality, colour rendition or lighting, all of which you improve.',
].join('\n')

/**
 * The scale contract in placement mode. States the positive instruction —
 * match the mockup — and deliberately states no fractions of its own, because
 * any number here could contradict what the shopper actually dragged.
 */
export const PLACEMENT_SCALE_BLOCK = [
  'SCALE COMES FROM THE MOCKUP — the customer set the size themselves, so there is no house rule to apply here:',
  '- Match the size shown in the layout mockup. Whatever proportion of the surface the artwork covers there is the correct proportion; a large mark stays large and a small one stays small.',
  '- Do not apply a default size, a house margin or a tidier proportion of your own. If the artwork runs close to an edge in the mockup, it runs close to that edge in the render.',
  '- The size is fixed in both directions. Do not enlarge a mark to make it more readable and do not shrink one to make it fit, sit more comfortably or balance the composition. If a mark looks small, that is the size the customer chose.',
  '- Everything else about the mark — its artwork, colours, proportions and line count — is fixed by the rules above.',
].join('\n')

/** Heading for the per-layer lines from `describePlacement`. */
export const PLACEMENT_FACTS_HEADING =
  'Where each element sits (measured from the layout mockup — these numbers and the mockup say the same thing, and both are binding):'

/** The layout block, ready to push onto a prompt. */
export function placementFacts(lines: string[]): string {
  return [PLACEMENT_FACTS_HEADING, ...lines].join('\n')
}
