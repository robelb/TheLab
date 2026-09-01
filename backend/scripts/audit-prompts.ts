/**
 * Consistency audit for every image-generation prompt.
 *
 *   pnpm audit:prompts
 *
 * Renders every variant of the four image prompts (onboarding branding, the
 * bundle/kit photo, the product photoshoot, the box print) and checks that:
 *
 *   A. the admin-editable default templates render byte-identical to the
 *      built-in builders (they are three copies of one prompt by design —
 *      this is what catches them drifting apart)
 *   B. every {{placeholder}} is declared in the registry and provided by the
 *      corresponding vars builder
 *   C. every variant that can place a logo carries the one-line rule and the
 *      shrink-to-fit rule
 *   D. no variant contains contradicting instructions (grow-the-logo wording,
 *      full-bleed + hard-margin together, verbatim-quote vs autocorrect)
 *   E. the size caps tell one story everywhere (quarter-to-third target,
 *      40% ceiling)
 *   F. every reference image the services attach is described by position —
 *      an undescribed attachment invites the model to misread it
 *   J. a prompt carrying a hand-placed layout states NO size cap of its own —
 *      the house fractions and an explicit placement cannot both be true
 *
 * Exits non-zero on any failure, so it can run in CI.
 */
import {
  buildCustomizePrompt,
  buildCustomizeTemplateVars,
  CUSTOMIZE_DEFAULT_TEMPLATE,
} from '../src/systemInstruction/brandCustomize.js'
import {
  buildCampaignKitImagePrompt,
  buildKitTemplateVars,
  KIT_IMAGE_DEFAULT_TEMPLATE,
} from '../src/systemInstruction/campaign.js'
import { buildPhotoshootPrompt } from '../src/systemInstruction/productPhotoshoot.js'
import { buildBoxPrintPrompt } from '../src/systemInstruction/boxCustomization.js'
import { placementInventory } from '../src/customizer/composeLayout.js'
import { renderInstructionTemplate } from '../src/modules/system-instructions/system-instructions.service.js'
import { INSTRUCTION_DEFINITIONS } from '../src/systemInstruction/registry.js'

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `\n      → ${detail}` : ''}`)
}

function firstDiff(a: string, b: string): string {
  const A = a.split('\n')
  const B = b.split('\n')
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (A[i] !== B[i]) {
      return `line ${i + 1}:\n        tmpl: ${A[i]?.slice(0, 90)}\n        code: ${B[i]?.slice(0, 90)}`
    }
  }
  return 'lengths differ'
}

/** A hand-placed layout, as `describePlacement` renders one. */
const placedLogo = [
  '- The brand logo sits in the upper centre, its centre 50% across and 28% down the image, spanning 46% of the image width. It is upright — do not tilt it.',
]
const placedLogoAndText = [
  ...placedLogo,
  '- The wording "THANK YOU" sits in the centre, its centre 50% across and 58% down the image, spanning 60% of the image width. It is upright — do not tilt it. The mockup sets it in a plain placeholder face: keep its position, size and tilt, but set it properly as real print in a sans-style typeface that suits the design.',
]
/** A layout that also carries uploaded artwork, which has no attachment of its own. */
const placedWithArtwork = [
  ...placedLogoAndText,
  '- A piece of supplied artwork sits in the lower right, its centre 78% across and 80% down the image, spanning 18% of the image width. It is upright — do not tilt it. It is already correct in the mockup: reproduce that artwork exactly as shown — same shapes, colours and detail — printed onto the surface. Never redraw it, replace it, restyle it or leave it out.',
]

const wideLogo = {
  width: 900,
  height: 300,
  aspectRatio: 3,
  shape: 'a wide single-line horizontal wordmark, much wider than tall',
  colors: ['#0b1f3a', '#ffffff'],
} as never

// ── A. Admin template ↔ built-in builder ────────────────────────────────────
console.log('\n── A. template ↔ builder sync ──')
{
  const ctx = {
    companyName: 'big little things',
    productName: 'ARCONOT Notebook — Black',
    productDescription: '<p>A5 hardcover notebook with elastic closure.</p>',
    hasLogo: true,
    hasFavicon: true,
    logoFacts: wideLogo,
    faviconFacts: wideLogo,
  }
  const built = buildCustomizePrompt(ctx)
  const rendered = renderInstructionTemplate(
    CUSTOMIZE_DEFAULT_TEMPLATE,
    buildCustomizeTemplateVars(ctx),
  )
  check('brand-customize: template === builder', rendered === built, firstDiff(rendered, built))
}
{
  const names = ['Mug', 'Pen', 'Notebook']
  const withSupplies = {
    hasLogo: true,
    companyName: 'big little things',
    logoFacts: wideLogo,
    packaging: { name: 'Magnetbox', description: 'print on the lid and front' },
    filling: { name: 'Füllmaterial - Rot' },
  }
  const a = buildCampaignKitImagePrompt(names, withSupplies)
  const ra = renderInstructionTemplate(
    KIT_IMAGE_DEFAULT_TEMPLATE,
    buildKitTemplateVars(names, withSupplies),
  )
  check('kit-image: template === builder (with supplies)', ra === a, firstDiff(ra, a))

  const noSupplies = { hasLogo: true, companyName: 'BLT', logoFacts: wideLogo }
  const b = buildCampaignKitImagePrompt(names, noSupplies)
  const rb = renderInstructionTemplate(
    KIT_IMAGE_DEFAULT_TEMPLATE,
    buildKitTemplateVars(names, noSupplies),
  )
  check('kit-image: template === builder (no supplies)', rb === b, firstDiff(rb, b))
}

// ── B. Placeholder coverage ─────────────────────────────────────────────────
console.log('\n── B. placeholder coverage ──')
for (const def of INSTRUCTION_DEFINITIONS) {
  const used = [...def.defaultTemplate.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])
  const declared = new Set(def.placeholders.map((p) => p.name))
  const undeclared = used.filter((u) => !declared.has(u))
  check(
    `${def.key}: template placeholders all declared in registry`,
    undeclared.length === 0,
    `undeclared: ${undeclared.join(', ')}`,
  )
}
{
  const varsA = Object.keys(
    buildCustomizeTemplateVars({ companyName: 'x', hasLogo: true, hasFavicon: true }),
  )
  const usedA = [...CUSTOMIZE_DEFAULT_TEMPLATE.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])
  check(
    'brand-customize: vars builder provides every used placeholder',
    usedA.every((u) => varsA.includes(u)),
    `missing: ${usedA.filter((u) => !varsA.includes(u)).join(',')}`,
  )
  const varsB = Object.keys(buildKitTemplateVars(['x'], { hasLogo: true }))
  const usedB = [...KIT_IMAGE_DEFAULT_TEMPLATE.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])
  check(
    'kit-image: vars builder provides every used placeholder',
    usedB.every((u) => varsB.includes(u)),
    `missing: ${usedB.filter((u) => !varsB.includes(u)).join(',')}`,
  )
}

// ── C + D + E. Per-variant rule coverage, contradictions, size caps ─────────
const variants: [string, string][] = [
  ['customize·logo', buildCustomizePrompt({ companyName: 'BLT', hasLogo: true, hasFavicon: false, logoFacts: wideLogo })],
  ['customize·favicon', buildCustomizePrompt({ companyName: 'BLT', hasLogo: false, hasFavicon: true, faviconFacts: wideLogo })],
  ['customize·both', buildCustomizePrompt({ companyName: 'BLT', hasLogo: true, hasFavicon: true, logoFacts: wideLogo, faviconFacts: wideLogo })],
  ['kit·logo', buildCampaignKitImagePrompt(['Mug', 'Pen'], { hasLogo: true, companyName: 'BLT', logoFacts: wideLogo })],
  ['kit·logo+supplies', buildCampaignKitImagePrompt(['Mug'], { hasLogo: true, companyName: 'BLT', logoFacts: wideLogo, packaging: { name: 'Box' }, filling: { name: 'Fill' } })],
  ['shoot·scene+brand', buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: true })],
  ['shoot·style+brand', buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: true, hasBranding: true })],
  ['shoot·refine+brand', buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: true, hasBase: true })],
  ['box·brand·stock', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Thank you"', hasBranding: true })],
  ['box·brand·fullcolour', buildBoxPrintPrompt({ boxName: 'Full Colour Box', boxDescription: 'full-color box', request: 'print "Thank you"', hasBranding: true })],
  ['box·brand·refine', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'make it bolder', hasBranding: true, hasBase: true })],
  ['box·logo-only', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: '', hasBranding: true })],
  ['box·brand·layout', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Thank you"', hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogoAndText, placedText: ['THANK YOU'] })],
  ['box·brand·layout·fullcolour', buildBoxPrintPrompt({ boxName: 'Full Colour Box', boxDescription: 'full-color box', request: 'print "Thank you"', hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogo })],
  ['shoot·brand·layout', buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogo })],
]

/** The variants above that carry a hand-placed layout, for section J. */
const layoutVariants: [string, string][] = [
  ['box·brand·layout', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Thank you"', hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogoAndText, placedText: ['THANK YOU'] })],
  ['box·brand·layout·fullcolour', buildBoxPrintPrompt({ boxName: 'Full Colour Box', boxDescription: 'full-color box', request: 'print "Thank you"', hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogo })],
  ['box·layout·no-brand', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Thank you"', hasBranding: false, hasLayout: true, placement: placedLogoAndText, placedText: ['THANK YOU'] })],
  ['shoot·brand·layout', buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogo })],
]

console.log('\n── C. logo rules coverage ──')
for (const [name, p] of variants) {
  // A one-line mark must never be re-stacked. HOW that is guaranteed depends
  // on who owns the size: where the model does, it shrinks the mark to fit;
  // where the customer set it by hand, the size is fixed and there is nothing
  // to fit. Demanding "SMALLER" of both would force a shrink licence back into
  // the placed prompts, which is the contradiction this whole section guards.
  const placed = /Its SIZE has already been chosen by the customer and is fixed/.test(p)
  check(
    `${name}: one-line, resolved by ${placed ? 'a fixed size' : 'shrink-to-fit'}`,
    /one line|ONE single line|ONE LINE/i.test(p) &&
      (placed ? /do not shrink it/i.test(p) : /SMALLER/i.test(p)),
  )
  check(
    `${name}: opens with the logo rule`,
    p.startsWith('FIRST, THE LOGO RULE'),
    'the as-is / shrink-only / never-multi-line contract must be the first line of every logo-bearing prompt',
  )
  // The logo's colours are the customer's, full stop. The prompts used to carry
  // a black/white swap for marks that vanished into their surface; it was
  // removed because it changed a design people had already approved. This check
  // is what stops it drifting back in.
  check(
    `${name}: never recolours or inverts the logo`,
    /never recolour, invert or swap/.test(p) &&
      !/LOGO CONTRAST/.test(p) &&
      !/black becomes white/.test(p),
    'a colour-swap instruction is back in the prompt — the logo must print in its supplied colours',
  )
  check(
    `${name}: logo copied from reference, never from memory`,
    /never drawn from memory/.test(p),
    'the anti-hallucination clause is missing from the opening logo rule',
  )
  check(
    `${name}: no stale colour phrasing`,
    !/never change the colours/.test(p) &&
      !/lighter or darker area of that item instead/.test(p) &&
      !/WHOLE mark in solid|switches WHOLLY|rendered ENTIRELY in solid|ENTIRE mark to a one-colour|whole mark switches/.test(p),
    'an outdated colour rule (absolute ban, or whole-mark toggle) survives and contradicts the black/white-swap rule',
  )
}
{
  // And prompts WITHOUT a logo must not open with a rule about an image
  // that is not attached.
  const noLogo: [string, string][] = [
    ['shoot·no-brand', buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: false })],
    ['box·no-brand', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Hi"', hasBranding: false })],
    ['kit·no-logo', buildCampaignKitImagePrompt(['Mug'], { hasLogo: false })],
  ]
  for (const [name, p] of noLogo) {
    check(`${name}: no phantom logo rule`, !p.includes('FIRST, THE LOGO RULE'))
  }
}

console.log('\n── D. contradictions ──')
const GROW = [
  /clearly legible at a glance/i,
  /larger on wide flat/i,
  /\bproperly sized\b/i,
  /as large as/i,
  /fill the (?:face|surface|lid)/i,
]
for (const [name, p] of variants) {
  const hits = GROW.filter((r) => r.test(p))
  check(`${name}: no grow-the-logo phrasing`, hits.length === 0, hits.map(String).join(' '))
}
{
  const full = buildBoxPrintPrompt({ boxName: 'Full Colour Box', boxDescription: 'full-color box', request: 'a red box', hasBranding: false })
  const stock = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'a red box', hasBranding: false })
  check('full-colour box: bleed rule without margin rule', /full bleed|edge to edge/.test(full) && !/never bleed off the edges/i.test(full))
  check('stock box: margin rule without bleed rule', /Never bleed off the edges/i.test(stock) && !/run full bleed/.test(stock))
}
{
  const verbatim = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'write "chirsmas vibes"', hasBranding: false })
  check(
    'box·quoted-typo: typo-fix bullet exempts quoted wording',
    /keeping their spelling, spacing, accents and capitalisation even where unconventional/.test(verbatim) &&
      /Correct obvious misspellings[^\n]*quoted text is reproduced exactly as written/i.test(verbatim),
    'INTERPRETATION orders spell-correction with no exemption for quoted text, contradicting the verbatim contract',
  )
  const fc = verbatim.split('\n\n').find((b) => b.startsWith('FINAL CHECK'))!
  check('box·quoted-typo: FINAL CHECK verifies the exact quoted string', /reads exactly "chirsmas vibes", character for character/.test(fc))

  const intent = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'write marry chirsmas on it', hasBranding: false })
  const ifc = intent.split('\n\n').find((b) => b.startsWith('FINAL CHECK'))!
  check(
    'box·intent: FINAL CHECK verifies the corrected message, not the typo',
    /corrected, properly spelled/.test(ifc) && !/spelled exactly as asked/.test(ifc),
  )
}

console.log('\n── E. size-cap numbers ──')
for (const [name, p] of variants) {
  check(`${name}: no bare a-third hard cap`, !/spans (?:no )?more than (?:about )?a third/.test(p),
    'a final check still caps at a third with no mention of the 40% ceiling')
  const allows40 = /never exceed 40%/.test(p)
  const hasThirdCheck = /a quarter to a third of the (?:width of the )?face/.test(p)
  check(
    `${name}: 40% ceiling restated wherever the cap is checked`,
    !(allows40 && hasThirdCheck) || /never past 40%/.test(p),
    'MARK SCALE grants up to 40% but the final check omits it',
  )
}

// ── F. Every attachment described by position ───────────────────────────────
// Attachment orders these mirror (keep in sync with the services):
//   brand-customize  → product, logo, favicon           (generateGemini/OpenAI)
//   kit image        → products…, box, filling, logo    (campaigns.service)
//   photoshoot       → [base|style]?, product, branding (products.service)
//   box print fresh  → box, branding?                   (products.service)
//   box print refine → current, box, branding?          (products.service)
console.log('\n── F. attachment descriptions ──')
{
  const fresh = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Hi"', hasBranding: true })
  check('box·fresh+brand: both attachments described by position',
    /FIRST image is the exact gift box/.test(fresh) && /FINAL image is the brand logo/.test(fresh))
  const freshNoBrand = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Hi"', hasBranding: false })
  check('box·fresh no-brand: no phantom logo reference', !/FINAL image is the brand logo/.test(freshNoBrand))
  const refine = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'add stars', hasBranding: true, hasBase: true })
  check('box·refine: all three attachments described',
    /FIRST image is the current customised/.test(refine) && /SECOND image is the original box/.test(refine) && /FINAL image is the brand logo/.test(refine))
  const refineNoBrand = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'add stars', hasBranding: false, hasBase: true })
  check('box·refine no-brand: exactly two attachments described',
    /SECOND image is the original box/.test(refineNoBrand) && !/FINAL image is the brand logo/.test(refineNoBrand))
}
{
  // layout attachment orders (keep in sync with products.service):
  //   box print + layout → composite, box, branding?
  //   photoshoot + layout → composite, product, branding?
  const boxLayout = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Hi"', hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogo })
  check('box·layout: composite FIRST, plain box SECOND, and no logo attachment',
    /FIRST image is the layout mockup/.test(boxLayout) &&
      /SECOND image is the original box product photo/.test(boxLayout) &&
      // The composite already carries the mark. Promising a logo image that is
      // not sent is what let the model treat it as a second one to apply.
      !/FINAL image is the brand logo/.test(boxLayout))
  const boxLayoutNoBrand = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Hi"', hasBranding: false, hasLayout: true, placement: placedLogoAndText })
  check('box·layout no-brand: no phantom logo reference',
    !/FINAL image is the brand logo/.test(boxLayoutNoBrand))
  const shootLayout = buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogo })
  check('shoot·layout: mockup and product described, no logo attachment',
    /LAYOUT MOCKUP \(the first image\)/.test(shootLayout) &&
      /PRODUCT reference/.test(shootLayout) &&
      !/BRANDING reference/.test(shootLayout))
}
{
  const kit = buildCampaignKitImagePrompt(['Mug'], { hasLogo: true, companyName: 'BLT', packaging: { name: 'Box' }, filling: { name: 'Fill' } })
  check('kit: box + filling + logo all described',
    /BOX reference/.test(kit) && /FILLING reference/.test(kit) && /FINAL image is the company logo/.test(kit))
}

// ── I. box print: one box only, logo present when requested ─────────────────
console.log('\n── I. one box + logo presence ──')
{
  const fresh = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Hi"', hasBranding: true })
  const refine = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'add stars', hasBranding: true, hasBase: true })
  const noBrand = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Hi"', hasBranding: false })
  for (const [name, pr] of [['fresh', fresh], ['refine', refine], ['no-brand', noBrand]] as const) {
    check(`box·${name}: ONE BOX block present`,
      /ONE BOX ONLY — the finished image contains exactly ONE gift box/.test(pr) &&
        /All the reference images describe this one SAME box/.test(pr))
  }
  check('box·branded: logo made mandatory, never invented',
    /it MUST appear on the box/.test(fresh) && /never draw it from memory/.test(fresh))
  check('box·branded: FINAL CHECK verifies the logo IS present',
    /\(4\) the brand logo from the FINAL reference image IS on the box/.test(fresh))
  check('box·no-brand: FINAL CHECK forbids any brand mark',
    /\(4\) no logo, brand name or wordmark appears anywhere on the box/.test(noBrand))
  check('box: final check demands exactly ONE box',
    /\(5\) exactly ONE box appears, in one single photograph/.test(fresh))

  const kitWithLogo = buildCampaignKitImagePrompt(['Mug', 'Pen'], { hasLogo: true, companyName: 'BLT' })
  const kitNoLogo = buildCampaignKitImagePrompt(['Mug', 'Pen'], { hasLogo: false })
  check('kit·logo: early per-product recap (small, one line, as-is, on each)',
    /EVERY PRODUCT GETS THE LOGO/.test(kitWithLogo) &&
      /on ONE line when the artwork is one line/.test(kitWithLogo) &&
      /no product left out/.test(kitWithLogo))
  check('kit·no-logo: no recap for a logo that is not attached',
    !/EVERY PRODUCT GETS THE LOGO/.test(kitNoLogo))
  check('kit·logo: branding block bans invented marks',
    /never draw it from memory/.test(kitWithLogo))
}

// ── H. single render: no duplicates, one scene at the given dimensions ──────
console.log('\n── H. single render ──')
{
  const everyVariant: [string, string][] = [
    ...variants,
    ['shoot·no-brand', buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'portrait', productName: 'Mug', hasStyle: false, hasBranding: false })],
    ['box·no-brand', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Hi"', hasBranding: false })],
    ['kit·no-logo', buildCampaignKitImagePrompt(['Mug'], { hasLogo: false })],
  ]
  for (const [name, p] of everyVariant) {
    check(
      `${name}: single-render contract present`,
      /SINGLE RENDER — one of everything/.test(p) &&
        /never fill it by repeating the product/.test(p),
      'the no-duplication / fill-with-background contract is missing',
    )
  }
}

// ── J. a hand-placed layout overrides the house geometry ────────────────────
// The whole point of the placement editor is that the customer decides size and
// position. Every fraction the prompt system states elsewhere — a quarter of the
// face, a 40% ceiling, a 12% margin — becomes a contradiction the moment they
// drag past it, and a model given both instructions splits the difference. So a
// layout-bearing prompt must state no size rule of its own.
console.log('\n── J. layout overrides house geometry ──')
{
  const CAPS: [RegExp, string][] = [
    [/never exceed 40%/i, 'the 40% ceiling'],
    [/quarter to (?:one )?a? ?third/i, 'the quarter-to-third target'],
    [/about a quarter of the width/i, 'the quarter-of-the-face logo default'],
    [/roughly a quarter of the width/i, 'the quarter-of-the-face logo default'],
    [/half to two thirds of the width/i, 'the half-to-two-thirds design target'],
    [/at least 12%/i, 'the 12% print margin'],
    [/at least 15% of the face/i, 'the 15% clear-space rule'],
    [/never bleed off the edges/i, 'the no-bleed margin rule'],
    [/an oversized logo/i, 'the oversized-logo avoid'],
    [/oversized, edge-to-edge or illegible branding/i, 'the oversized-branding avoid'],
  ]
  for (const [name, p] of layoutVariants) {
    const hits = CAPS.filter(([r]) => r.test(p)).map(([, label]) => label)
    check(
      `${name}: no house size cap survives`,
      hits.length === 0,
      `${hits.join(', ')} contradicts the placement the customer set by hand`,
    )
    check(
      `${name}: placement contract + facts present`,
      /PLACEMENT IS ALREADY DECIDED/.test(p) &&
        /SCALE COMES FROM THE MOCKUP/.test(p) &&
        /Where each element sits/.test(p),
    )
    check(
      `${name}: artwork-integrity rules survive the swap`,
      /LOGO STAYS ON ONE LINE/.test(p) || !/FIRST, THE LOGO RULE/.test(p),
      'dropping the scale block must not drop the one-line contract with it',
    )
  }
  // ── placed wording is asked-for wording.
  // A text layer the user dragged onto the box is a request. The standing
  // "no wording that was not asked for" rule predates the editor and, left
  // alone, orders the model to delete exactly what they just positioned —
  // which is a contradiction the model resolves however it likes.
  {
    const cases: [string, string][] = [
      // No brief at all: the wording exists only as a placed layer.
      ['box·placed-only', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: '', hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogoAndText, placedText: ['THANK YOU'] })],
      // A brief that names no wording of its own.
      ['box·placed+vague-brief', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'something festive', hasBranding: false, hasLayout: true, placement: placedLogoAndText, placedText: ['THANK YOU'] })],
      ['shoot·placed', buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogoAndText, placedText: ['THANK YOU'] })],
    ]
    for (const [name, p] of cases) {
      check(
        `${name}: placed wording is named as asked-for`,
        /PLACED WORDING/.test(p) && /"THANK YOU"/.test(p),
      )
      check(
        `${name}: nothing orders the placed wording removed`,
        !/no wording appears that was not asked for/.test(p) &&
          !/with no wording, motifs, patterns or decoration/.test(p) &&
          !/no artwork, wording or decoration added/.test(p) &&
          !/extra logos or text;/.test(p),
        'a standing no-wording rule contradicts the text layer the user placed',
      )
    }
    const boxPlaced = cases[0][1]
    const fc = boxPlaced.split('\n\n').find((b) => b.startsWith('FINAL CHECK'))!
    check(
      'box·placed-only: FINAL CHECK verifies the placed wording IS present',
      /the placed wording "THANK YOU" IS on the box/.test(fc),
    )
    // And a layout with no text layers keeps the original rule.
    const logoOnly = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: '', hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogo })
    check('box·layout·logo-only: no phantom placed-wording block', !/PLACED WORDING/.test(logoOnly))
  }

  // ── a set of already-designed products is COMPOSED, not re-branded.
  // The kit prompt is a photoshoot brief: it attaches a logo and tells the
  // model to apply it to every product. Pointed at products the customer
  // designed one by one, that brief redesigns all of them. When nothing is
  // left to brand the job changes kind, and every instruction about applying a
  // mark has to go with it — the logo attachment included.
  {
    const names = ['Mug', 'Pen']
    const compose = buildCampaignKitImagePrompt(names, { hasLogo: true, companyName: 'BLT', logoFacts: wideLogo, preBranded: names })
    const mixed = buildCampaignKitImagePrompt(names, { hasLogo: true, companyName: 'BLT', logoFacts: wideLogo, preBranded: ['Mug'] })
    const plain = buildCampaignKitImagePrompt(names, { hasLogo: true, companyName: 'BLT', logoFacts: wideLogo })

    check('kit·compose: framed as composition, not a photoshoot',
      /You are an expert photo compositor/.test(compose) &&
        /you place the products, you do not redraw them/i.test(compose) &&
        !/expert commercial product photographer/.test(compose))

    check('kit·compose: the reproduction contract is present',
      /REPRODUCE EACH PRODUCT EXACTLY/.test(compose) &&
        /The ONLY things you may change are: SCALE/.test(compose) &&
        /redesign, restyle, recolour or re-texture a product/.test(compose))

    // The heart of it: nothing may instruct the model to render a mark.
    const BRANDING_INSTRUCTIONS: [RegExp, string][] = [
      [/FIRST, THE LOGO RULE/, 'the apply-the-logo opener'],
      [/EVERY PRODUCT GETS THE LOGO/, 'the per-product logo recap'],
      [/^BRANDING —/m, 'the branding application block'],
      [/MARK SCALE/, 'the logo size rules'],
      [/LOGO STAYS ON ONE LINE/, 'the logo typesetting rules'],
      [/^TEXT LAYOUT:/m, 'the lettering rules'],
      [/the FINAL image is the company logo/i, 'a logo attachment that is no longer sent'],
    ]
    const hits = BRANDING_INSTRUCTIONS.filter(([r]) => r.test(compose)).map(([, l]) => l)
    check('kit·compose: nothing instructs it to render branding', hits.length === 0,
      `${hits.join(', ')} survives and invites the model to redesign products it should only be placing`)

    check('kit·compose: fidelity outranks the composition',
      /\(1\) each product reproduced exactly as its reference/.test(compose))
    check('kit·compose: FINAL CHECK compares each product to its reference',
      /unmistakably the SAME item as its reference/.test(compose) &&
        /Compare each product against its reference one at a time/.test(compose))
    check('kit·compose: adds nothing that is not in a reference',
      /add nothing — no logo, brand name, slogan, label or caption that is not already in a reference image/.test(compose))

    // A mixed set still has products that genuinely need branding, so the
    // photoshoot apparatus must survive — with the designed ones exempted.
    check('kit·mixed: still a photoshoot for the unbranded products',
      /EVERY PRODUCT GETS THE LOGO/.test(mixed) && /MARK SCALE/.test(mixed) &&
        /choose the OPTIMAL spot/.test(mixed))
    check('kit·mixed: the designed product is named and exempted',
      /1\. Mug — ALREADY BRANDED/.test(mixed) &&
        /2\. Pen$/m.test(mixed) &&
        /any size rule stated elsewhere in this brief does not apply to them/.test(mixed))

    check('kit·plain: unchanged from the shipping prompt',
      !/ALREADY BRANDED/.test(plain) && !/REPRODUCE EACH PRODUCT EXACTLY/.test(plain) &&
        /EVERY PRODUCT GETS THE LOGO/.test(plain) && /MARK SCALE/.test(plain) &&
        plain.startsWith('FIRST, THE LOGO RULE'))
  }

  // ── uploaded artwork is baked into the mockup, not attached separately.
  // Every other reference image is described by position (section F) because
  // an undescribed attachment gets misread. Artwork has no attachment at all,
  // so the risk inverts: an unexplained graphic in the mockup is something the
  // model feels free to reinterpret. The placement line has to say the mockup
  // IS its reference — without inventing an attachment that was never sent.
  {
    const art = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Thank you"', hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedWithArtwork, placedText: ['THANK YOU'] })
    const shootArt = buildPhotoshootPrompt({ sceneType: 'as-is', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedWithArtwork, placedText: ['THANK YOU'] })

    for (const [name, p] of [['box·artwork', art], ['shoot·artwork', shootArt]] as const) {
      check(`${name}: the artwork is pinned to the mockup`,
        /A piece of supplied artwork sits/.test(p) &&
          /reproduce that artwork exactly as shown/.test(p) &&
          /Never redraw it, replace it, restyle it or leave it out/.test(p))
      // The attachment list must not grow — artwork rides in the composite.
      check(`${name}: no phantom attachment for the artwork`,
        !/artwork reference/i.test(p) && !/ARTWORK image/i.test(p),
        'the prompt promises an attachment the service never sends')
      check(`${name}: artwork is not confused with the logo`,
        !/A piece of supplied artwork[^\n]*brand logo/.test(p))
      // Everything section J asserts must still hold with artwork present.
      check(`${name}: no house size cap reintroduced`,
        !/never exceed 40%/.test(p) && !/at least 12%/.test(p) &&
          /PLACEMENT IS ALREADY DECIDED/.test(p))
    }

    // Bold wording asks for a weight, not a different contract.
    const bold = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: '', hasBranding: false, hasLayout: true,
      placement: ['- The wording "SALE" sits in the centre, its centre 50% across and 50% down the image, spanning 40% of the image width. It is upright — do not tilt it. The mockup sets it in a plain placeholder face: keep its position, size and tilt, but set it properly as real print in a bold sans-style typeface that suits the design.'],
      placedText: ['SALE'] })
    check('box·bold-wording: the weight reaches the brief',
      /real print in a bold sans-style typeface/.test(bold) &&
        /PLACED WORDING/.test(bold))
  }

  // ── a hand-set size is fixed, and the list of elements is closed.
  // Two failure modes the earlier work left open. First, four separate clauses
  // still granted "make it smaller to fit" — written when the model chose the
  // size, and a licence to overrule the customer once they choose it
  // themselves. Section J only ever checked for size CAPS, so they survived.
  // Second, nothing said the placement list was COMPLETE, and a model handed a
  // branded product happily adds a second logo or a tagline without
  // contradicting a word of the brief.
  {
    const inv = placementInventory({ layers: [
      { id: 'l', kind: 'logo', x: 0.5, y: 0.34, width: 0.26 },
      { id: 't', kind: 'text', x: 0.5, y: 0.6, width: 0.4, text: 'THANK YOU' },
    ] })
    const placedArgs = { hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogoAndText, placedText: ['THANK YOU'], inventory: inv }
    const cases: [string, string][] = [
      ['box·fixed-size', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Thank you"', ...placedArgs })],
      ['shoot·fixed-size', buildPhotoshootPrompt({ sceneType: 'as-is', aspectRatio: 'square', productName: 'Mug', hasStyle: false, ...placedArgs })],
    ]

    // Licences, not prohibitions — "no smaller repeat" is fine, "make it
    // smaller" is not.
    const LICENCES: [RegExp, string][] = [
      [/free to make it SMALLER/, 'the opening logo rule'],
      [/shrink it as much as needed/, 'the opening logo rule'],
      [/make it SMALLER until it fits/, 'the one-line block'],
      [/Keep shrinking rather than restacking/, 'the one-line block'],
      [/you may still change is the LOGO’s size/, 'the placement scale block'],
      [/PRINT IT SMALLER/, 'the kit branding block'],
    ]
    for (const [name, p] of cases) {
      const hits = LICENCES.filter(([r]) => r.test(p)).map(([, l]) => l)
      check(`${name}: nothing licenses resizing a hand-set mark`, hits.length === 0,
        `${hits.join(', ')} still permits shrinking a size the customer chose`)
      check(`${name}: the size contract opens the prompt`,
        /Its SIZE has already been chosen by the customer and is fixed/.test(p))
      check(`${name}: one-line rule no longer resolves fit by shrinking`,
        /nothing to solve here/.test(p) && /Never stack it, wrap it, break it across lines/.test(p))
      check(`${name}: the element list is stated as closed`,
        /NOTHING BEYOND THIS/.test(p) &&
          /the customer placed exactly 2 elements/.test(p) &&
          /Add no further logo anywhere in the frame/.test(p) &&
          /Add no further wording anywhere/.test(p))
      check(`${name}: closes with a countable self-check`,
        /count what appears on the product/.test(p))
    }

    // The ordinary paths still need shrink-to-fit — the model owns the size
    // there, and removing it would strand a wide wordmark on a narrow product.
    const plainShoot = buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: true })
    const plainBox = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Hi"', hasBranding: true })
    for (const [name, p] of [['shoot·no-layout', plainShoot], ['box·no-layout', plainBox]] as const) {
      check(`${name}: keeps shrink-to-fit and gains no inventory`,
        /free to make it SMALLER/.test(p) &&
          /make it SMALLER until it fits/.test(p) &&
          !/NOTHING BEYOND THIS/.test(p) &&
          !/Its SIZE has already been chosen/.test(p))
    }

    // A single-element layout must say "one", not "1 elements".
    const one = placementInventory({ layers: [{ id: 'l', kind: 'logo', x: 0.5, y: 0.4, width: 0.2 }] })
    check('inventory·single: counts and reads correctly',
      /placed exactly 1 element on this product/.test(one) &&
        /contains that one and nothing else/.test(one) &&
        /more than that one/.test(one))
    // Two logo layers is a legitimate thing to place; the count must follow.
    const twoLogos = placementInventory({ layers: [
      { id: 'a', kind: 'logo', x: 0.3, y: 0.4, width: 0.2 },
      { id: 'b', kind: 'logo', x: 0.7, y: 0.4, width: 0.2 },
    ] })
    check('inventory·two-logos: does not forbid the second one it was given',
      /The logo appears 2 times because the customer placed it 2 times/.test(twoLogos))
    check('inventory·empty: nothing placed, nothing said',
      placementInventory({ layers: [] }) === '')
  }

  // ── with a layout the logo is ALREADY on the product, so nothing may say
  // "apply it". The model is handed a mockup that already carries the mark plus
  // the logo as its own attachment; told to apply the attachment, it adds a
  // second copy — observed as a duplicate lower down the same bottle. The fix
  // is not another prohibition, it is removing the instruction to add.
  {
    const inv = placementInventory({ layers: [{ id: 'l', kind: 'logo', x: 0.42, y: 0.66, width: 0.14 }] })
    const cases: [string, string][] = [
      ['box·placed-logo', buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: '', hasBranding: true, hasLayout: true, placement: placedLogo, inventory: inv, logoPlaced: true })],
      ['shoot·placed-logo', buildPhotoshootPrompt({ sceneType: 'as-is', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: true, hasLayout: true, placement: placedLogo, inventory: inv, logoPlaced: true })],
    ]
    const ADD_INSTRUCTIONS: [RegExp, string][] = [
      [/Apply the EXACT logo\/mark from the BRANDING reference onto/, 'the photoshoot branding block'],
      [/applying it is part of the task/, 'the box branding block'],
      [/it MUST appear on the box: applying it/, 'the box branding block'],
    ]
    for (const [name, p] of cases) {
      const hits = ADD_INSTRUCTIONS.filter(([r]) => r.test(p)).map(([, l]) => l)
      check(`${name}: nothing tells it to apply an already-placed logo`, hits.length === 0,
        `${hits.join(', ')} asks the model to add a mark the mockup already carries — this is what duplicates it`)
      check(`${name}: states the logo is already there`,
        /is ALREADY on the (product|box)/.test(p) &&
          /never to add one|never add one/.test(p))
      // No logo file is sent at all in this mode, so the prompt must say the
      // mockup is the only source rather than pointing at an attachment that
      // does not exist — a phantom reference is its own failure mode.
      check(`${name}: names the mockup as the only source for the mark`,
        /No separate logo file is supplied/.test(p) &&
          /the mockup is the only source for this mark/.test(p))
      check(`${name}: demands exactly one and says what to do with a duplicate`,
        /Exactly ONE logo appears/.test(p) &&
          /remove every other/.test(p))
      // Fidelity must survive the rewrite.
      check(`${name}: still bans inventing the mark`, /never draw it from memory|never drawn from memory/.test(p))
    }
    // A layout that places only WORDING leaves the logo unplaced, so the model
    // must still position it — and must not be told it is already there.
    const textOnly = buildPhotoshootPrompt({ sceneType: 'as-is', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: true, hasLayout: true, placement: ['- The wording "HI" sits in the centre…'], placedText: ['HI'] })
    check('shoot·text-only-layout: does not claim an unplaced logo is placed',
      !/is ALREADY on the product/.test(textOnly) &&
        /Apply the EXACT logo\/mark from the BRANDING reference onto/.test(textOnly),
      'a layout that places no logo must still instruct the model to position one')

    // Without a layout the model genuinely has to apply the logo — that
    // instruction must stay exactly where it was.
    const plainBox = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Hi"', hasBranding: true })
    const plainShoot = buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: true })
    check('box·no-layout: still instructed to apply the logo',
      /applying it is part of the task/.test(plainBox) && !/is ALREADY on the box/.test(plainBox))
    check('shoot·no-layout: still instructed to apply the logo',
      /Apply the EXACT logo\/mark from the BRANDING reference onto/.test(plainShoot) &&
        !/is ALREADY on the product/.test(plainShoot))
  }

  // ── "keep the product photo" must actually keep it.
  // Branding a product and photographing one shared an endpoint, so every
  // render also restaged the item. In keep mode the photograph is the one
  // thing that must not change, and nothing in the brief may ask for a scene,
  // a re-frame or a re-light.
  {
    const keep = buildPhotoshootPrompt({ sceneType: 'as-is', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: false, logoPlaced: true, hasLayout: true, placement: placedLogo })
    const keepNoLayout = buildPhotoshootPrompt({ sceneType: 'as-is', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: true })
    const staged = buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: true })

    for (const [name, p] of [['shoot·keep+layout', keep], ['shoot·keep', keepNoLayout]] as const) {
      check(`${name}: the photograph is preserved`,
        /KEEP THE PHOTOGRAPH/.test(p) &&
          /Same background, same surface, same props, same framing and crop/.test(p) &&
          /The ONLY difference between the input and your output is the branding/.test(p))
      const SCENE_ASKS: [RegExp, string][] = [
        [/Stage it as a hero shot/, 'the studio-hero staging instruction'],
        [/minimal pedestal/, 'a pedestal'],
        [/Make .* the single hero of the shot/, 'the re-framing instruction'],
        [/premium commercial photography/, 'the re-shoot framing'],
        [/clean, intentional composition/, 'the re-composition instruction'],
        [/^Scene: /m, 'a scene block'],
      ]
      const hits = SCENE_ASKS.filter(([r]) => r.test(p)).map(([, l]) => l)
      check(`${name}: nothing asks for a new photograph`, hits.length === 0,
        `${hits.join(', ')} survives and restages a product the user only wanted branded`)
      check(`${name}: says so at the end too`,
        /recognisable as the SAME photograph that was supplied/.test(p))
    }

    // Picking a real scene must still stage the product as it always did.
    check('shoot·staged: unchanged from the shipping prompt',
      !/KEEP THE PHOTOGRAPH/.test(staged) &&
        /Stage it as a hero shot/.test(staged) &&
        /Make the Mug the single hero of the shot/.test(staged))

    // Keep mode is meaningless once another image owns the edit base.
    const refine = buildPhotoshootPrompt({ sceneType: 'as-is', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: true, hasBase: true })
    const style = buildPhotoshootPrompt({ sceneType: 'as-is', aspectRatio: 'square', productName: 'Mug', hasStyle: true, hasBranding: true })
    check('shoot·keep+refine: refine still owns the edit base',
      !/KEEP THE PHOTOGRAPH/.test(refine) && /expert photo retoucher/.test(refine) &&
        /CURRENT image \(the first image\)/.test(refine))
    check('shoot·keep+style: a style image is a scene, so it wins',
      !/KEEP THE PHOTOGRAPH/.test(style) && /SCENE image \(the first image\)/.test(style))
  }

  // And the reverse: a prompt with no layout keeps the house rules it has
  // always had. This is what stops section J being satisfied by deleting them.
  const plainBox = buildBoxPrintPrompt({ boxName: 'Eco Box white', boxDescription: 'natural or white', request: 'print "Hi"', hasBranding: true })
  const plainShoot = buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: true })
  check('box·no-layout: house print scale still applies', /PRINT SCALE/.test(plainBox) && /at least 12%/.test(plainBox))
  check('shoot·no-layout: MARK SCALE still applies', /MARK SCALE/.test(plainShoot) && /never exceed 40%/.test(plainShoot))
  check('no-layout: no phantom placement contract',
    !/PLACEMENT IS ALREADY DECIDED/.test(plainBox) && !/PLACEMENT IS ALREADY DECIDED/.test(plainShoot))
}

// ── G. placement follows the product identity ───────────────────────────────
console.log('\n── G. identity-driven placement ──')
{
  const withFacts = buildCustomizePrompt({
    companyName: 'BLT',
    productName: 'UTAH GLASS — Black',
    productDescription: '<p>Glass bottle with bamboo lid, 500&nbsp;ml.</p>',
    hasLogo: true,
    hasFavicon: false,
    logoFacts: wideLogo,
  })
  check('customize: THE PRODUCT facts present when supplied',
    /THE PRODUCT — what you are printing on:/.test(withFacts) && /UTAH GLASS/.test(withFacts))
  check('customize: description is stripped of HTML and entities',
    /Glass bottle with bamboo lid, 500 ml\./.test(withFacts) && !/<p>|&nbsp;/.test(withFacts))
  check('customize: placement step 2 reads the facts',
    /identify what the product IS — from THE PRODUCT facts when given/.test(withFacts))
  const noFacts = buildCustomizePrompt({ companyName: 'BLT', hasLogo: true, hasFavicon: false, logoFacts: wideLogo })
  check('customize: no empty THE PRODUCT block when facts are unknown', !/THE PRODUCT —/.test(noFacts))
  const kit = buildCampaignKitImagePrompt(['Mug'], { hasLogo: true, companyName: 'BLT' })
  check('kit: per-item identity step before choosing the spot',
    /first identify what the item IS — from its name in the PRODUCT SET and from its reference image/.test(kit))
  const shoot = buildPhotoshootPrompt({ sceneType: 'studio-hero', aspectRatio: 'square', productName: 'Mug', hasStyle: false, hasBranding: true })
  check('photoshoot: placement judged from what the product is',
    /where that product is branded in real life — judge from what the product is and what the photo shows/.test(shoot))
}

console.log(`\n${failures === 0 ? 'ALL CLEAN' : `${failures} ISSUE(S) FOUND`}`)
process.exit(failures === 0 ? 0 : 1)
