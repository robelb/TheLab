/**
 * The photo of a box a shopper built: the products standing in a group in
 * front of the closed gift box, front-on, on a warm studio backdrop — the
 * look of a retailer's hero shot rather than the overhead flat-lay the
 * campaign builder uses.
 *
 * Written against the failures of the flat-lay prompt it replaces, which
 * matter more than its wording:
 *
 *   - Products came back as blank bags and plain wrappers. That brief spent
 *     most of its length forbidding logos, brand names and labels so nothing
 *     would be branded for the customer — and the model read it as "remove
 *     them", stripping the manufacturer's own packaging. These are retail
 *     goods: their printing IS the product. So the only thing ruled out here
 *     is adding things, and keeping the packaging is the first rule.
 *   - The box's own print vanished: an open box seen from above shows its
 *     inside. Closed, standing, lid to camera, the print is the backdrop.
 *   - It was slow: eight references and a 7,000-character brief. The filling
 *     is inside a closed box, so it is not sent; the brief is a third of the
 *     length, each rule said once.
 *
 * Kept from the old prompt, because they were right: references named by
 * position (image k is product k), an explicit product count, an
 * allow-list of what may change, and a final check.
 */

export interface BoxHeroPackaging {
  name: string
  /** True when its reference is the shopper's own printed design. */
  designed?: boolean
}

export interface BoxHeroOptions {
  /** The chosen box or bag, sent as the reference after the products. */
  packaging?: BoxHeroPackaging | null
  /** Products whose reference is a design the shopper made. */
  designed?: string[]
}

const TASK_BLOCK =
  'You are a commercial product photographer. Create ONE photorealistic studio photograph of a gift box and the products packed in it, styled as a premium e-commerce hero shot: the closed gift box standing at the back, the products grouped in front of it.'

function referenceBlock(count: number, hasPackaging: boolean): string {
  const lines = ['REFERENCE IMAGES, in the order provided:']
  lines.push(
    count === 1
      ? '- Image 1 is the PRODUCT in the list below.'
      : `- Images 1-${count} are the PRODUCTS, in the order of the list below: image 1 is product 1, image 2 is product 2, and so on.`,
  )
  if (hasPackaging) {
    lines.push(
      `- Image ${count + 1} is the GIFT PACKAGING the products come in. It is the backdrop of the shot, never one of the products.`,
    )
  }
  return lines.join('\n')
}

function productBlock(names: string[], designed: string[] = []): string {
  const mine = new Set(designed)
  const lines = names.map(
    (name, i) => `${i + 1}. ${name}${mine.has(name) ? ' — CUSTOMER DESIGN' : ''}`,
  )
  return [
    `PRODUCTS — exactly these ${names.length}, each shown once, and nothing else:`,
    ...lines,
    '',
    'ONE OF EACH: every product above is ONE physical item in the photo. Never show a product twice — not a second copy, not a copy in another pose or from another angle, not a partly hidden or lying-down duplicate behind the group. Each item appears exactly as its own reference shows it, once.',
  ].join('\n')
}

function packagingLine(packaging?: BoxHeroPackaging | null): string {
  if (!packaging) {
    return '- At the back, centred, stands a closed plain kraft-brown gift box, upright, its lid turned toward the camera.'
  }
  return `- At the back, centred, stands the "${packaging.name}" from the packaging reference, CLOSED and upright, its printed front or lid turned squarely toward the camera so its design is fully visible and readable. It fills roughly the upper-middle half of the frame and frames the group.`
}

const SHOT_RULES = [
  '- Camera: front view at a slightly raised eye level, about 10-15° above the products, natural 50-85 mm perspective. Not a top-down flat-lay, no wide-angle distortion, no tilted horizon.',
  '- The products stand in front of the packaging in a staggered, layered group, like a well-styled shop display: the tallest items (bottles, tall bags, tins, tall boxes) at the left and right edges and slightly further back, smaller and flatter items in the middle and at the front. Front items may overlap the ones behind by a little, but every product stays clearly recognisable.',
  '- Every product stands upright with its front label facing the camera, as on a shelf. Thin or flat items lean against the packaging or the item behind them. Nothing floats, nothing lies flat facing up, nothing is hidden behind another item.',
  '- Keep real relative sizes: the weights and volumes in the product names tell you which items are bigger (a 90 g bag of popcorn is larger than a 30 g bar).',
  '- The group is centred and fills about 80% of the frame width, with even space at both sides and a little below.',
].join('\n')

const SET_BLOCK = [
  'SET AND LIGHT:',
  '- A seamless warm cream-beige studio backdrop that curves into the floor, a touch lighter and warmer towards the top. No horizon line, no table edge, no props, no decorations, no text.',
  '- Soft, warm directional daylight from the upper left, like a large window: gentle soft shadows falling to the right and behind the items, and a soft diagonal fall-off of light across the backdrop.',
  '- True, natural product colours; crisp focus on every product; high-end commercial quality; square 1:1 frame.',
].join('\n')

const FIDELITY_BLOCK = [
  'FIDELITY — the most important rule, ahead of styling:',
  '- These are real retail products. Reproduce each one exactly as its reference shows it: the same shape, proportions, colours and materials, and its own printed packaging — brand name, product name, logos, illustrations, certification seals (Bio, vegan, Fairtrade) and every line of lettering, in the same place and the same colours.',
  '- Never blank out, simplify, translate, re-letter, restyle or "clean up" a product’s packaging. A product without its printing is a different product.',
  '- A product marked CUSTOMER DESIGN carries the customer’s own artwork: keep it exactly where and as large as its reference shows it.',
  '- The packaging is exactly the one in its reference: the same material, colour, construction and printed design. Do not add, remove or change any print on it.',
  '- All you may change is what the shot needs: the size of each item in the frame, its position, the turn needed to stand it upright facing the camera, and light and shadow.',
  '- Add nothing: no extra or duplicate products, no company logo, stickers, ribbons, gift tags, greeting cards, price tags, filling material spilling out, or text that is not in a reference.',
].join('\n')

const OUTPUT_BLOCK =
  'OUTPUT: one single photograph of one scene. Never a collage, grid, split image or several frames.'

function finalCheckBlock(count: number): string {
  return `FINAL CHECK before returning the image: go through the product list one by one and find each product in the photo exactly once — there are exactly ${count} product${count === 1 ? '' : 's'} and no item appears twice; each one carries the same packaging artwork, brand and lettering as its reference; the packaging stands closed at the back with its design facing the camera; the backdrop is warm cream with soft light from the upper left. If anything fails, correct it first.`
}

export function buildBoxHeroPrompt(
  productNames: string[],
  options: BoxHeroOptions = {},
): string {
  const count = productNames.length
  return [
    TASK_BLOCK,
    referenceBlock(count, Boolean(options.packaging)),
    productBlock(productNames, options.designed),
    ['THE SHOT:', packagingLine(options.packaging), SHOT_RULES].join('\n'),
    SET_BLOCK,
    FIDELITY_BLOCK,
    OUTPUT_BLOCK,
    finalCheckBlock(count),
  ].join('\n\n')
}

// ── Admin override support ──────────────────────────────────────────────────

/** Runtime data for a `box-hero-image` override template. */
export function buildBoxHeroTemplateVars(
  productNames: string[],
  options: BoxHeroOptions = {},
): Record<string, string> {
  return {
    productCount: String(productNames.length),
    referenceImages: referenceBlock(productNames.length, Boolean(options.packaging)),
    productSet: productBlock(productNames, options.designed),
    packaging: packagingLine(options.packaging),
    finalCheck: finalCheckBlock(productNames.length),
  }
}

/** The built-in prompt with its runtime blocks as `{{placeholders}}`. */
export const BOX_HERO_DEFAULT_TEMPLATE = [
  TASK_BLOCK,
  '{{referenceImages}}',
  '{{productSet}}',
  ['THE SHOT:', '{{packaging}}', SHOT_RULES].join('\n'),
  SET_BLOCK,
  FIDELITY_BLOCK,
  OUTPUT_BLOCK,
  '{{finalCheck}}',
].join('\n\n')
