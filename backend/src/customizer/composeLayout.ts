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
 * through `normalizeImageForAi`, so an SVG mark is already a transparent PNG.
 */

import { fetchImage, type FetchedImage } from './fetchImage.js'
import {
  MAX_LAYER_ASSETS,
  MIN_LAYER_WIDTH,
  type PlacementLayer,
  type PlacementLayout,
} from './placementLayout.js'

type Sharp = typeof import('sharp')

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const

/**
 * Families the SVG renderer can actually resolve.
 *
 * Text in the composite is a PLACEMENT HINT, not the finished lettering — the
 * image model re-typesets it as real print — so an approximate face is fine and
 * a missing font would not be.
 *
 * `script` cannot be the CSS generic. Pango, which renders this SVG, knows only
 * `sans` / `serif` / `monospace`; `cursive` is not a generic it recognises, so
 * it was treated as an unknown family name, skipped, and the `serif` fallback
 * won every time. Script wording came out identical to Serif, which meant the
 * mockup people signed off did not show the face they had chosen. Naming real
 * chancery/casual faces first fixes it — the generic stays on the end so an
 * unknown host still gets something.
 *
 * Deployment note: the named faces are macOS (Snell Roundhand, Apple Chancery)
 * and the URW base-35 set (`fonts-urw-base35` / `gsfonts`, which supplies
 * `Z003`). A Linux image without either falls back to serif again, so keep one
 * of those packages installed on the render host.
 */
const FONT_FAMILIES: Record<string, string> = {
  sans: 'sans-serif',
  serif: 'serif',
  script:
    "Snell Roundhand, 'Apple Chancery', 'URW Chancery L', Z003, 'Comic Sans MS', cursive, serif",
  mono: 'monospace',
}

/** Big enough that trimming to the ink and scaling down stays sharp. */
const TEXT_RENDER_PX = 200

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

/** Only ever emit a colour we recognise — this string lands inside SVG markup. */
function safeColor(value: string | undefined): string {
  return value && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
    ? value
    : '#111111'
}

function normalizeRotation(rotation: number | undefined): number {
  if (!rotation || !Number.isFinite(rotation)) return 0
  const wrapped = ((rotation % 360) + 360) % 360
  return Math.round(wrapped * 10) / 10
}

/**
 * Render wording to a tight, transparent PNG exactly `targetWidth` across.
 *
 * Set at a large fixed size, then trimmed to the ink and scaled to fit, rather
 * than guessing a font size from glyph metrics — the browser editor measures
 * and scales its text the same way, which is what keeps the two previews
 * agreeing on how much of the box the wording covers.
 */
async function renderText(
  sharp: Sharp,
  layer: PlacementLayer,
  targetWidth: number,
): Promise<Buffer | null> {
  const text = layer.text?.trim()
  if (!text) return null

  const family = FONT_FAMILIES[layer.fontStyle ?? 'sans'] ?? FONT_FAMILIES.sans
  const weight = layer.fontWeight === 'bold' ? 'bold' : 'normal'
  const fill = safeColor(layer.color)

  // Wording can be several lines. Each becomes a `tspan` on the same anchor,
  // stepped down by one line height; trim-to-ink then scale-to-width still
  // does the rest, which is why the browser and this agree regardless of how
  // many lines there are.
  const lines = text.split('\n')
  const longest = lines.reduce((max, l) => Math.max(max, l.length), 1)

  // Generous canvas — the text only has to fit inside it; trim finds the ink.
  const canvasWidth = Math.ceil(TEXT_RENDER_PX * (longest + 2))
  const canvasHeight = Math.ceil(TEXT_RENDER_PX * (1.5 + LINE_HEIGHT_EM * lines.length))
  const firstBaseline =
    canvasHeight / 2 -
    (TEXT_RENDER_PX * LINE_HEIGHT_EM * (lines.length - 1)) / 2 +
    TEXT_RENDER_PX * 0.35

  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${canvasWidth / 2}"${
          i === 0 ? '' : ` dy="${LINE_HEIGHT_EM}em"`
        }>${escapeXml(line) || ' '}</tspan>`,
    )
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}"><text x="${
    canvasWidth / 2
  }" y="${firstBaseline}" font-family="${family}" font-size="${TEXT_RENDER_PX}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${tspans}</text></svg>`

  try {
    // `trim` throws when the render is entirely uniform — a face that resolved
    // to nothing, or whitespace-only text. Either way there is no layer.
    const inked = await sharp(Buffer.from(svg, 'utf8')).png().trim().toBuffer()
    return await sharp(inked)
      .resize({ width: targetWidth, withoutEnlargement: false })
      .png()
      .toBuffer()
  } catch {
    return null
  }
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
    urls.map((url) => fetchImage(url, 'logo')),
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
    buffer = await sharp(source.buffer)
      .resize({ width: targetWidth, withoutEnlargement: false })
      .png()
      .toBuffer()
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
): Promise<Buffer> {
  const { default: sharp } = await import('sharp')

  // Settle orientation before measuring — metadata reports the stored size, so
  // an EXIF-rotated photo would otherwise be measured on its side.
  const flat = await sharp(base.buffer).rotate().png().toBuffer()
  const meta = await sharp(flat).metadata()
  const baseWidth = meta.width
  const baseHeight = meta.height
  if (!baseWidth || !baseHeight) {
    throw new Error('Could not read the base image dimensions')
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
    const weight = layer.fontWeight === 'bold' ? 'bold ' : ''
    lines.push(
      `- The wording "${text}" sits ${where}${rotationClause(
        layer.rotation,
      )} The mockup sets it in a plain placeholder face: keep its position, size and tilt, but set it properly as real print in a ${weight}${
        layer.fontStyle ?? 'sans'
      }-style typeface that suits the design.`,
    )
  }
  return lines
}
