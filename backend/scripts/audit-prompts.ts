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
]

console.log('\n── C. logo rules coverage ──')
for (const [name, p] of variants) {
  check(
    `${name}: one-line + shrink-to-fit`,
    /one line|ONE single line|ONE LINE/i.test(p) && /SMALLER/i.test(p),
  )
  check(
    `${name}: opens with the logo rule`,
    p.startsWith('FIRST, THE LOGO RULE'),
    'the as-is / shrink-only / never-multi-line contract must be the first line of every logo-bearing prompt',
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
  const kit = buildCampaignKitImagePrompt(['Mug'], { hasLogo: true, companyName: 'BLT', packaging: { name: 'Box' }, filling: { name: 'Fill' } })
  check('kit: box + filling + logo all described',
    /BOX reference/.test(kit) && /FILLING reference/.test(kit) && /FINAL image is the company logo/.test(kit))
}

console.log(`\n${failures === 0 ? 'ALL CLEAN' : `${failures} ISSUE(S) FOUND`}`)
process.exit(failures === 0 ? 0 : 1)
