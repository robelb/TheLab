/**
 * Flatten a placement layout onto a product photo.
 *
 * This is the ONLY flattener. The instant flat mockup the shopper approves and
 * the edit base handed to the image model both come through here, so the two
 * can never drift apart — what they approved is literally what the model is
 * asked to make photoreal.
 *
 * It runs server-side rather than in a browser `<canvas>` for two reasons: a
 * canvas taints on any image without CORS headers (brand logos are arbitrary
 * URLs scraped off customer websites and mostly lack them), and sharp is
 * already the project's raster toolchain — the logo arriving here has been
 * through `normalizeImageForAi`, so an SVG mark is already a transparent PNG,
 * with its markup alongside for when a raster that size would not be sharp
 * enough.
 */

import {
  fetchImage,
  type FetchedImage,
  type FetchImageOptions,
} from './fetchImage.js'
import { shapeWording } from './placementFonts.js'
import {
  type FontStyle,
  MAX_LAYER_ASSETS,
  MIN_LAYER_WIDTH,
  type PlacementLayer,
  type PlacementLayout,
} from './placementLayout.js'

type Sharp = typeof import('sharp')

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const

/**
 * Families for wording the bundled faces cannot set.
 *
 * Placed wording is normally drawn as glyph outlines from the same font files
 * the browser editor loads — see `placementFonts`. This is the fallback for
 * wording those faces have no glyphs for, which goes through font lookup the
 * old way: the editor will have borrowed the missing glyphs from some other
 * font too, so exact agreement is off the table there, and drawing something
 * beats drawing empty boxes.
 *
 * `script` cannot be the CSS generic. Pango, which renders this SVG, knows only
 * `sans` / `serif` / `monospace`; `cursive` is not a generic it recognises, so
 * it was treated as an unknown family name, skipped, and the `serif` fallback
 * won every time. Naming real chancery/casual faces first keeps Script looking
 * like script; the generic stays on the end so an unknown host still gets
 * something.
 *
 * DEPLOYMENT — the production image is `node:22-alpine`, which ships no fonts
 * and no fontconfig config at all, so `backend/Dockerfile` installs these. Keep
 * the two in step:
 *
 *   - the three generics come from `font-dejavu`
 *   - `Parisienne` (`font-parisienne`) is the calligraphic face for `script` —
 *     Alpine packages neither the URW base-35 set (`Z003`) nor a chancery face,
 *     so the macOS and URW names below only ever resolve in local development
 *   - `Comic Sans MS` and the `cursive` generic are last-resort only
 */
const FONT_FAMILIES: Record<string, string> = {
  sans: 'sans-serif',
  serif: 'serif',
  script:
    "Snell Roundhand, 'Apple Chancery', 'URW Chancery L', Z003, Parisienne, 'Comic Sans MS', cursive, serif",
  mono: 'monospace',
}

/**
 * The same four choices, described to the image model in visual terms.
 *
 * The model never sees the word "script" as a font setting — it sees a prompt.
 * Naming the class ("a script-style typeface") turned out not to be enough:
 * every prompt that carried it also told the model to choose "a typeface that
 * suits the design", and between an adjective and an invitation the invitation
 * won. Script, serif and mono wording all came back set in the same generic
 * sans, so the face the shopper picked in the editor never reached the render.
 *
 * These strings describe what the letters must LOOK like, which is the thing a
 * diffusion model can actually act on, and each ends by ruling out the failure
 * it kept producing. Keep them in step with the faces in `placementFonts` and
 * with `FONT_STACKS` / `FONT_LABELS` in the browser canvas — those three are
 * how the same choice is shown in the editor, drawn into the mockup, and asked
 * for in the render.
 */
const FONT_DESCRIPTIONS: Record<FontStyle, string> = {
  sans: 'a clean sans-serif typeface — even stroke weight, no serifs at all, modern and geometric',
  serif:
    'a serif typeface — every stem visibly bracketed with serifs, with contrast between thick and thin strokes, in the manner of a traditional printed book face. Not a sans-serif',
  script:
    'a flowing script typeface — genuinely handwritten or calligraphic, slanted, with the letters of each word joined up. Not an upright printed face of any kind',
  mono:
    'a monospaced typewriter typeface — every character on the same width, slab-like terminals, mechanical rather than elegant. Not a proportional face',
}

/** How the chosen face is named in prose, weight included. */
function typefaceClause(layer: PlacementLayer): string {
  const description = FONT_DESCRIPTIONS[layer.fontStyle ?? 'sans']
  return layer.fontWeight === 'bold' ? `${description}, set bold` : description
}

/** Where the first pass sets the type, before it knows how wide the ink runs. */
const TEXT_RENDER_PX = 200

/** Ceiling on the intermediate text canvas, so a long line cannot run away. */
const MAX_TEXT_CANVAS_PX = 6000

/** Slack above and below the lines on the text canvas, in ems. */
const TEXT_CANVAS_LEADING = 1.5

/** How far a layer may be enlarged before it is worth rendering again. */
const UPSCALE_TOLERANCE = 1.05

/** Line spacing for multi-line wording, in ems. Matches the browser preview. */
const LINE_HEIGHT_EM = 1.2

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * The colour a text layer prints in when nobody has picked one.
 *
 * Must match `DEFAULT_TEXT_COLOR` in the browser canvas. The two used to differ
 * by a shade, so a layer carrying no colour of its own — an AI-produced layout,
 * or one whose colour failed to parse — previewed in one near-black and printed
 * in another.
 */
const DEFAULT_TEXT_COLOR = '#1f2933'

/** Only ever emit a colour we recognise — this string lands inside SVG markup. */
function safeColor(value: string | undefined): string {
  return value && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
    ? value
    : DEFAULT_TEXT_COLOR
}

function normalizeRotation(rotation: number | undefined): number {
  if (!rotation || !Number.isFinite(rotation)) return 0
  const wrapped = ((rotation % 360) + 360) % 360
  return Math.round(wrapped * 10) / 10
}

/**
 * Render wording to a tight, transparent PNG exactly `targetWidth` across.
 *
 * Set at a large size, then trimmed to the ink and scaled to fit, rather than
 * guessing a font size from glyph metrics — the browser editor measures its own
 * wording to the ink the same way, which is what keeps the two agreeing on how
 * much of the photograph the wording covers and where its centre falls.
 *
 * Two passes, because one fixed size cannot serve every layout. The first finds
 * how wide this wording's ink actually is; if the layout wants it wider than
 * that, the type is RE-SET at the size it is going to be printed at instead of
 * the first pass being blown up. Scaling a raster up is how the wording came
 * out soft next to the logo beside it — and a mockup billed as exactly what
 * prints has to stand being looked at closely.
 */
async function renderText(
  sharp: Sharp,
  layer: PlacementLayer,
  targetWidth: number,
): Promise<Buffer | null> {
  const text = layer.text?.trim()
  if (!text) return null

  const style = layer.fontStyle ?? 'sans'
  const family = FONT_FAMILIES[style] ?? FONT_FAMILIES.sans
  const weight = layer.fontWeight === 'bold' ? 'bold' : 'normal'
  const fill = safeColor(layer.color)

  // Wording can be several lines. Each becomes a `tspan` on the same anchor,
  // stepped down by one line height; trim-to-ink then scale-to-width still
  // does the rest, which is why the browser and this agree regardless of how
  // many lines there are.
  const lines = text.split('\n')
  const longest = lines.reduce((max, l) => Math.max(max, l.length), 1)
  const canvasHeightFor = (fontPx: number) =>
    Math.ceil(fontPx * (TEXT_CANVAS_LEADING + LINE_HEIGHT_EM * lines.length))

  /** One pass: set the type at `fontPx`, rasterize, crop to the ink. */
  const setType = async (fontPx: number, canvasWidth: number) => {
    const canvasHeight = canvasHeightFor(fontPx)
    const firstBaseline =
      canvasHeight / 2 -
      (fontPx * LINE_HEIGHT_EM * (lines.length - 1)) / 2 +
      fontPx * 0.35

    // The same glyphs the editor drew, from the same file — see
    // `placementFonts`. Font lookup only for wording those faces cannot set.
    const shaped = await shapeWording(
      lines,
      style,
      weight,
      fontPx,
      canvasWidth / 2,
      firstBaseline,
      LINE_HEIGHT_EM,
    ).catch((err: unknown) => {
      console.warn(
        '[composeLayout] could not shape wording from the bundled face:',
        err instanceof Error ? err.message : err,
      )
      return null
    })

    let body: string
    if (shaped) {
      body = `<g fill="${fill}">${shaped.markup}</g>`
    } else {
      const tspans = lines
        .map(
          (line, i) =>
            `<tspan x="${canvasWidth / 2}"${
              i === 0 ? '' : ` dy="${LINE_HEIGHT_EM}em"`
            }>${escapeXml(line) || ' '}</tspan>`,
        )
        .join('')
      body = `<text x="${
        canvasWidth / 2
      }" y="${firstBaseline}" font-family="${family}" font-size="${fontPx}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${tspans}</text>`
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">${body}</svg>`

    try {
      // `trim` throws when the render is entirely uniform — a face that resolved
      // to nothing, or whitespace-only text. Either way there is no layer.
      return await sharp(Buffer.from(svg, 'utf8'))
        .png()
        .trim()
        .toBuffer({ resolveWithObject: true })
    } catch {
      return null
    }
  }

  // Generous canvas — the text only has to fit inside it; trim finds the ink.
  let inked = await setType(
    TEXT_RENDER_PX,
    Math.ceil(TEXT_RENDER_PX * (longest + 2)),
  )
  if (!inked) return null

  if (targetWidth > inked.info.width * UPSCALE_TOLERANCE) {
    // Now the ink width is known, the canvas can be sized to the wording rather
    // than guessed from its character count — which is what makes a second pass
    // at print size affordable however large it is.
    const emsWide = inked.info.width / TEXT_RENDER_PX + 2
    const fontPx = Math.min(
      (TEXT_RENDER_PX * targetWidth) / inked.info.width,
      MAX_TEXT_CANVAS_PX /
        Math.max(emsWide, TEXT_CANVAS_LEADING + LINE_HEIGHT_EM * lines.length),
    )
    if (fontPx > TEXT_RENDER_PX) {
      const reset = await setType(fontPx, Math.ceil(fontPx * emsWide))
      // A failed second pass is not a failed layer — the first one still prints.
      if (reset) inked = reset
    }
  }

  // Always the last word on the size: hinting and rounding leave the re-set ink
  // a pixel or two off what was asked for, and the layer's width is a contract.
  return sharp(inked.data)
    .resize({ width: targetWidth, withoutEnlargement: false })
    .png()
    .toBuffer()
}

/** Fade a layer by multiplying its alpha channel. */
async function applyOpacity(
  sharp: Sharp,
  buffer: Buffer,
  opacity: number,
): Promise<Buffer> {
  return sharp(buffer)
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer()
}

/** Artwork for the layout's image layers, keyed by the URL that produced it. */
export type LayerAssets = Record<string, FetchedImage>

/**
 * Download the artwork an image layer needs.
 *
 * Kept out of `composeLayout` so that function stays a pure compositor —
 * callers already fetch the base and the logo, and this joins that step rather
 * than hiding network access inside the render. Fetching a caller-supplied URL
 * is the posture `brandingImageUrl` has always had, so this adds no new class
 * of exposure; the `logo` role is reused because it already converts SVG to
 * transparent PNG and rejects the types that cannot be composited.
 */
export async function fetchLayoutAssets(
  layout: PlacementLayout,
  options: FetchImageOptions = {},
): Promise<LayerAssets> {
  const urls = [
    ...new Set(
      layout.layers
        .filter((l) => l.kind === 'image')
        .map((l) => l.imageUrl)
        .filter((u): u is string => Boolean(u)),
    ),
  ].slice(0, MAX_LAYER_ASSETS)
  if (urls.length === 0) return {}

  const assets: LayerAssets = {}
  const fetched = await Promise.allSettled(
    urls.map((url) => fetchImage(url, 'logo', options)),
  )
  urls.forEach((url, i) => {
    const result = fetched[i]
    if (result.status === 'fulfilled') assets[url] = result.value
    else {
      // One unreachable asset drops its layer, exactly as a missing logo does.
      // Failing the whole render would lose every other layer with it.
      console.warn(
        '[composeLayout] could not load layer artwork:',
        result.reason instanceof Error ? result.reason.message : result.reason,
      )
    }
  })
  return assets
}

interface Overlay {
  input: Buffer
  left: number
  top: number
}

/**
 * Rasterize one piece of artwork at exactly the width it is about to occupy.
 *
 * A vector mark is re-rendered at that width instead of being scaled: the
 * raster on `FetchedImage.buffer` is sized for an image model's input, and a
 * logo printed across a third of a photograph is routinely wider than that. It
 * used to be blown up to fit, so the mark went soft in the one picture that is
 * supposed to show precisely what prints — see `FetchedImage.vector`.
 *
 * `resize` on SVG input re-renders the document at the requested size rather
 * than resampling an intermediate, so there is nothing else to do here.
 */
async function renderArtwork(
  sharp: Sharp,
  source: FetchedImage,
  targetWidth: number,
): Promise<Buffer> {
  const raster = () =>
    sharp(source.buffer)
      .resize({ width: targetWidth, withoutEnlargement: false })
      .png()
      .toBuffer()

  if (!source.vector) return raster()
  try {
    return await sharp(source.vector, { density: 300 })
      .resize({ width: targetWidth, withoutEnlargement: false })
      .png()
      .toBuffer()
  } catch (err) {
    // The raster came from this same markup, so it is always there to fall back
    // on. A mark that renders softly still beats a mark that is missing.
    console.warn(
      '[composeLayout] could not re-render vector artwork:',
      err instanceof Error ? err.message : err,
    )
    return raster()
  }
}

async function renderLayer(
  sharp: Sharp,
  layer: PlacementLayer,
  baseWidth: number,
  baseHeight: number,
  logo: FetchedImage | undefined,
  assets: LayerAssets,
): Promise<Overlay | null> {
  if (layer.width < MIN_LAYER_WIDTH) return null
  const targetWidth = Math.round(layer.width * baseWidth)
  if (targetWidth < 2) return null

  let buffer: Buffer | null
  if (layer.kind === 'text') {
    buffer = await renderText(sharp, layer, targetWidth)
  } else {
    // Logo and image layers differ only in where the pixels come from.
    const source =
      layer.kind === 'logo' ? logo : layer.imageUrl ? assets[layer.imageUrl] : undefined
    if (!source) return null
    buffer = await renderArtwork(sharp, source, targetWidth)
  }
  if (!buffer) return null

  if (layer.opacity != null && layer.opacity < 1) {
    buffer = await applyOpacity(sharp, buffer, layer.opacity)
  }

  const rotation = normalizeRotation(layer.rotation)
  if (rotation !== 0) {
    buffer = await sharp(buffer)
      .rotate(rotation, { background: TRANSPARENT })
      .png()
      .toBuffer()
  }

  // Read the size back rather than computing it: rotation grows the bounding
  // box, and centring against a predicted size drifts the layer off its mark.
  const meta = await sharp(buffer).metadata()
  const width = meta.width ?? targetWidth
  const height = meta.height ?? targetWidth

  const left = Math.round(layer.x * baseWidth - width / 2)
  const top = Math.round(layer.y * baseHeight - height / 2)

  // Crop anything hanging off an edge instead of relying on negative composite
  // offsets, and drop a layer that has left the frame entirely.
  const cropLeft = Math.max(0, -left)
  const cropTop = Math.max(0, -top)
  const visibleWidth = Math.min(width - cropLeft, baseWidth - Math.max(0, left))
  const visibleHeight = Math.min(
    height - cropTop,
    baseHeight - Math.max(0, top),
  )
  if (visibleWidth <= 0 || visibleHeight <= 0) return null

  if (
    cropLeft > 0 ||
    cropTop > 0 ||
    visibleWidth < width ||
    visibleHeight < height
  ) {
    buffer = await sharp(buffer)
      .extract({
        left: cropLeft,
        top: cropTop,
        width: visibleWidth,
        height: visibleHeight,
      })
      .png()
      .toBuffer()
  }

  return { input: buffer, left: Math.max(0, left), top: Math.max(0, top) }
}

/**
 * How much bigger than the base photo a text or vector layer asks the canvas to
 * be. Both are resolution-free and so would otherwise demand the ceiling on
 * their own; this is the point past which they stop being the reason to grow.
 */
const RESOLUTION_FREE_SCALE = 2

export interface ComposeOptions {
  /**
   * Longest edge the render may grow to so that placed elements keep their own
   * resolution. Left unset, the canvas is the photo and nothing grows.
   *
   * The catalogue's photographs are 700px square. A logo, a piece of artwork or
   * a line of type placed on one was therefore rasterized onto a 700px grid —
   * artwork uploaded at 1600px went in at 315px, four fifths of it discarded —
   * and the result was then shown in a dialog wider than 700px on a screen with
   * two device pixels to the inch of it. The editor draws each element from its
   * own source and so looked sharp; the mockup, which is the thing people study
   * before ordering, looked soft, and the difference was the grid rather than
   * anything about the elements.
   *
   * Only the mockup sets this. The other caller composites an edit base for an
   * image model, which resamples to its own output size regardless, so growing
   * it there would buy nothing and cost tokens.
   */
  maxEdge?: number
}

/**
 * The canvas to composite on, as a multiple of the base photo.
 *
 * Driven by what the layers actually have: a raster asks for the resolution it
 * was uploaded at, and nothing asks for more than it can use. Upscaling the
 * photograph to meet them is not inventing detail in any sense that matters —
 * the render is displayed larger than 700px either way, and doing it here with
 * a proper filter beats leaving it to the browser.
 */
async function workingScale(
  sharp: Sharp,
  layout: PlacementLayout,
  baseWidth: number,
  baseEdge: number,
  logo: FetchedImage | undefined,
  assets: LayerAssets,
  maxEdge: number | undefined,
): Promise<number> {
  const ceiling = Math.min(
    (maxEdge ?? baseEdge) / baseEdge,
    // A cap in its own right: past here the file is mostly upscaled photograph.
    4,
  )
  if (!(ceiling > 1)) return 1

  let want = 1
  for (const layer of layout.layers) {
    if (layer.width < MIN_LAYER_WIDTH) continue
    const atBase = layer.width * baseWidth
    if (atBase < 1) continue

    if (layer.kind === 'text') {
      want = Math.max(want, RESOLUTION_FREE_SCALE)
      continue
    }
    const source =
      layer.kind === 'logo' ? logo : layer.imageUrl ? assets[layer.imageUrl] : undefined
    if (!source) continue
    if (source.vector) {
      want = Math.max(want, RESOLUTION_FREE_SCALE)
      continue
    }
    const width = (await sharp(source.buffer).metadata()).width
    if (width) want = Math.max(want, width / atBase)
  }
  return Math.min(ceiling, want)
}

/**
 * Paste the layout's layers onto the base photo and return a PNG.
 *
 * PNG rather than WebP because this is an intermediate that gets composited,
 * downscaled and re-encoded downstream — every generation of lossy re-encoding
 * softens the logo's edges, which is the one thing the model must read cleanly.
 */
export async function composeLayout(
  base: FetchedImage,
  layout: PlacementLayout,
  logo?: FetchedImage,
  assets: LayerAssets = {},
  options: ComposeOptions = {},
): Promise<Buffer> {
  const { default: sharp } = await import('sharp')

  // Settle orientation before measuring — metadata reports the stored size, so
  // an EXIF-rotated photo would otherwise be measured on its side.
  let flat = await sharp(base.buffer).rotate().png().toBuffer()
  const meta = await sharp(flat).metadata()
  let baseWidth = meta.width
  let baseHeight = meta.height
  if (!baseWidth || !baseHeight) {
    throw new Error('Could not read the base image dimensions')
  }

  const scale = await workingScale(
    sharp,
    layout,
    baseWidth,
    Math.max(baseWidth, baseHeight),
    logo,
    assets,
    options.maxEdge,
  )
  if (scale > 1.01) {
    // Resize on width alone and read the height back, so the layers' fractional
    // coordinates land on the same grid the photo did.
    flat = await sharp(flat)
      .resize({ width: Math.round(baseWidth * scale) })
      .png()
      .toBuffer()
    const grown = await sharp(flat).metadata()
    baseWidth = grown.width ?? baseWidth
    baseHeight = grown.height ?? baseHeight
  }

  // Iteration order is z-order: sharp paints the composite array front to
  // back, so a later layer sits above an earlier one — which is what lets the
  // editor's reorder buttons work with no contract of their own.
  const overlays: Overlay[] = []
  for (const layer of layout.layers) {
    const overlay = await renderLayer(
      sharp,
      layer,
      baseWidth,
      baseHeight,
      logo,
      assets,
    )
    if (overlay) overlays.push(overlay)
  }
  if (overlays.length === 0) return flat

  return sharp(flat).composite(overlays).png().toBuffer()
}

/** Wrap a composite back into the shape the generation pipeline passes around. */
export function composedImage(buffer: Buffer): FetchedImage {
  return {
    buffer,
    mimeType: 'image/png',
    base64: buffer.toString('base64'),
  }
}

// ---------------------------------------------------------------------------
// Describing a layout to the image model
// ---------------------------------------------------------------------------

/**
 * Where a layer sits, in words. The percentages are the precise instruction,
 * but models anchor far more reliably on "in the upper centre" than on
 * "x: 0.5, y: 0.28" — so the prompt gets both, saying the same thing twice.
 */
function zoneLabel(x: number, y: number): string {
  const column = x < 1 / 3 ? 'left' : x > 2 / 3 ? 'right' : 'centre'
  const row = y < 1 / 3 ? 'upper' : y > 2 / 3 ? 'lower' : 'middle'
  if (column === 'centre' && row === 'middle') return 'in the centre'
  if (column === 'centre') return `in the ${row} centre`
  if (row === 'middle') return `on the ${column}`
  return `in the ${row} ${column}`
}

const pct = (value: number) => `${Math.round(value * 100)}%`

function rotationClause(rotation: number | undefined): string {
  const deg = normalizeRotation(rotation)
  if (deg === 0) return ' It is upright — do not tilt it.'
  const clockwise = deg <= 180
  const amount = clockwise ? deg : 360 - deg
  return ` It is rotated ${amount}° ${clockwise ? 'clockwise' : 'anticlockwise'} — keep that same tilt.`
}

/**
 * The wording the user typed into text layers.
 *
 * The prompts need this separately from `describePlacement`: placement prose
 * says where the words are, but the wording CONTRACT — spell these exactly,
 * add nothing else — has to name them, or the standing "no wording that was
 * not asked for" rule reads as an order to delete them.
 */
export function placedTextLayers(layout: PlacementLayout): string[] {
  return layout.layers
    .filter((l) => l.kind === 'text')
    .map((l) => l.text?.trim())
    .filter((t): t is string => Boolean(t))
}

/**
 * The typeface each piece of placed wording must be set in.
 *
 * Separate from `describePlacement` for the same reason `placedTextLayers` is:
 * the placement lines are a paragraph about geometry, and a font choice buried
 * in one clause of one sentence reads as colour commentary next to the numbers
 * around it. Given its own heading in the prompt it reads as a requirement.
 *
 * Empty when nothing was placed as text, so callers can drop the block.
 */
export function placedTypefaces(layout: PlacementLayout): string[] {
  return layout.layers
    .filter((l) => l.kind === 'text' && l.text?.trim())
    .map((l) => `- "${l.text?.trim()}" is set in ${typefaceClause(l)}.`)
}

/**
 * An explicit inventory of everything the customer placed.
 *
 * `describePlacement` says where each element is, which is a set of positive
 * instructions. What it never says is that the list is COMPLETE — and an image
 * model handed a branded product will cheerfully add a second logo on the far
 * side, a repeat on the lid, a tagline under the mark, or a caption in the
 * background, none of which contradicts anything it was told.
 *
 * Naming the count and the contents turns an open brief into a closed one: the
 * model can check its own output against a list.
 */
export function placementInventory(layout: PlacementLayout): string {
  const items: string[] = []
  let logos = 0
  for (const layer of layout.layers) {
    if (layer.width < MIN_LAYER_WIDTH) continue
    if (layer.kind === 'logo') {
      logos += 1
      items.push('the brand logo')
    } else if (layer.kind === 'image') {
      items.push('one piece of supplied artwork')
    } else if (layer.text?.trim()) {
      items.push(`the wording "${layer.text.trim()}"`)
    }
  }
  if (items.length === 0) return ''

  const count = items.length
  const total = count === 1 ? 'that one' : `those ${count}`
  const lines = [
    `NOTHING BEYOND THIS — the customer placed exactly ${count} element${
      count === 1 ? '' : 's'
    } on this product, and your output contains ${total} and nothing else:`,
    ...items.map((item, i) => `${i + 1}. ${item}`),
    '- Add no further logo anywhere in the frame: not a second copy on another face, side, lid or edge, not a smaller repeat, not one on the background, a tag, a label or a surface behind the product.',
    '- Add no further wording anywhere: no tagline, slogan, company name, product name, web address, hashtag, price, badge, sticker, caption or watermark. Where the product already carries its own moulded or printed markings, leave those exactly as they are and add none of your own.',
    '- Do not decorate around what was placed — no frame, border, underline, panel, glow or ornament that is not in the list above.',
  ]
  if (logos > 1) {
    // The count is only a useful self-check if it matches what was placed.
    lines.push(
      `- The logo appears ${logos} times because the customer placed it ${logos} times, at the positions given. That is the exact number: no more, no fewer.`,
    )
  }
  lines.push(
    `- Before returning the image, count what appears on the product. If there is more than ${total}, remove the extras and return the corrected image.`,
  )
  return lines.join('\n')
}

/**
 * One line per layer, for the prompt. Written as statements of fact about the
 * mockup the model is looking at, not as requests — the placement has already
 * happened, and the model's job is to preserve it.
 */
export function describePlacement(layout: PlacementLayout): string[] {
  const lines: string[] = []
  for (const layer of layout.layers) {
    if (layer.width < MIN_LAYER_WIDTH) continue
    const where = `${zoneLabel(layer.x, layer.y)}, its centre ${pct(
      layer.x,
    )} across and ${pct(layer.y)} down the image, spanning ${pct(
      layer.width,
    )} of the image width.`

    if (layer.kind === 'logo') {
      lines.push(`- The brand logo sits ${where}${rotationClause(layer.rotation)}`)
      continue
    }

    // Artwork is baked into the mockup and has no attachment of its own, so
    // the mockup IS its reference. Say that plainly, or the model treats an
    // unexplained graphic as something to reinterpret.
    if (layer.kind === 'image') {
      lines.push(
        `- A piece of supplied artwork sits ${where}${rotationClause(
          layer.rotation,
        )} It is already correct in the mockup: reproduce that artwork exactly as shown — same shapes, colours and detail — printed onto the surface. Never redraw it, replace it, restyle it or leave it out.`,
      )
      continue
    }

    const text = layer.text?.trim()
    if (!text) continue
    // The colour is the customer's choice, so it has to be stated. The mockup
    // carries it in pixels, but the model is told to re-typeset this wording as
    // real print — and a re-typeset line with no colour named is a line the
    // model picks a colour for. Named here, it survives the render.
    //
    // The typeface is the customer's choice for exactly the same reason, and
    // used to be the one attribute this line handed back to the model. The
    // face is named in full here and again under its own heading — see
    // `placedTypefaces` — because a single passing adjective lost every time.
    const ink = safeColor(layer.color)
    lines.push(
      `- The wording "${text}" sits ${where}${rotationClause(
        layer.rotation,
      )} The mockup's lettering is a rough placeholder: keep its position, size, tilt and its colour ${ink}, and set it as real print in ${typefaceClause(
        layer,
      )}.`,
    )
  }
  return lines
}
