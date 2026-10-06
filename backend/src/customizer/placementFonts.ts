/**
 * Placed wording, set from the same font files the browser editor loads.
 *
 * The flat mockup is billed as exactly what the shopper placed, and wording was
 * the one part of it that was not. The editor drew it in whatever the browser
 * resolved `sans-serif` / `serif` to (Helvetica and Times on a Mac); the mockup
 * handed sharp an SVG `<text>` and got whatever fontconfig resolved the same
 * names to (DejaVu in the production image, one fallback face for every choice
 * on a Mac). Different letters, different widths — and since the compositor
 * scales the ink to the layer's width, a wider face also came out smaller.
 *
 * So the wording no longer goes through font lookup at all. HarfBuzz — the
 * shaper Chrome uses — shapes it with the exact file in `assets/fonts`, and the
 * glyph outlines go into the SVG as paths. The browser loads those same files
 * through `@font-face` (`client/src/components/canvas/placement-fonts.css`), so
 * both ends draw the same glyphs at the same advances, whatever the host has
 * installed. Keep the two lists in step.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FontStyle, FontWeight } from './placementLayout.js'

type HarfBuzz = typeof import('harfbuzzjs')
type HbFont = InstanceType<HarfBuzz['Font']>

/** `assets/fonts`, from `src/customizer` in development and `dist/customizer` in a build. */
const FONTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/fonts',
)

interface FaceFile {
  file: string
  /** For a variable font: where on its weight axis this face sits. */
  wght?: number
}

const FACES: Record<FontStyle, Record<FontWeight, FaceFile>> = {
  sans: {
    normal: { file: 'Lato-Regular.ttf' },
    bold: { file: 'Lato-Bold.ttf' },
  },
  serif: {
    normal: { file: 'CrimsonText-Regular.ttf' },
    bold: { file: 'CrimsonText-Bold.ttf' },
  },
  script: {
    normal: { file: 'DancingScript-Variable.ttf', wght: 400 },
    bold: { file: 'DancingScript-Variable.ttf', wght: 700 },
  },
  mono: {
    normal: { file: 'CourierPrime-Regular.ttf' },
    bold: { file: 'CourierPrime-Bold.ttf' },
  },
}

interface LoadedFace {
  font: HbFont
  upem: number
}

let harfbuzz: Promise<HarfBuzz> | undefined
const faces = new Map<string, Promise<LoadedFace>>()

function loadFace(style: FontStyle, weight: FontWeight): Promise<LoadedFace> {
  const { file, wght } = FACES[style][weight]
  const key = `${file}@${wght ?? ''}`
  let face = faces.get(key)
  if (!face) {
    face = (async () => {
      harfbuzz ??= import('harfbuzzjs')
      const hb = await harfbuzz
      const hbFace = new hb.Face(
        new hb.Blob(await readFile(path.join(FONTS_DIR, file))),
      )
      const font = new hb.Font(hbFace)
      if (wght !== undefined) font.setVariations([new hb.Variation('wght', wght)])
      return { font, upem: hbFace.upem }
    })()
    // A failed load is retried next time rather than cached as a failure.
    face.catch(() => faces.delete(key))
    faces.set(key, face)
  }
  return face
}

export interface ShapedWording {
  /** `<path>` elements, one per glyph, in canvas pixels. */
  markup: string
}

/**
 * Lay out wording as glyph outlines, the way the editor's span lays it out.
 *
 * Each line is centred on `centreX` by its advance width (`text-align: center`
 * in the editor, which measures with `white-space: pre`, so spaces count), and
 * baselines step down by `lineHeightEm` from `firstBaseline`.
 *
 * Null when the face lacks a glyph the wording needs — Amharic in a Latin face,
 * say. The browser would borrow that glyph from some other font, so this cannot
 * match it either way; the caller falls back to font lookup rather than drawing
 * empty boxes.
 */
export async function shapeWording(
  lines: string[],
  style: FontStyle,
  weight: FontWeight,
  fontPx: number,
  centreX: number,
  firstBaseline: number,
  lineHeightEm: number,
): Promise<ShapedWording | null> {
  const hb = await (harfbuzz ??= import('harfbuzzjs'))
  const { font, upem } = await loadFace(style, weight)
  const scale = fontPx / upem

  let markup = ''
  for (const [i, line] of lines.entries()) {
    if (!line) continue
    const buffer = new hb.Buffer()
    buffer.addText(line)
    buffer.guessSegmentProperties()
    hb.shape(font, buffer)
    const infos = buffer.getGlyphInfos()
    const positions = buffer.getGlyphPositions()
    if (infos.some((g) => g.codepoint === 0)) return null

    const advance = positions.reduce((sum, p) => sum + p.xAdvance, 0)
    const baseline = firstBaseline + i * lineHeightEm * fontPx
    let pen = centreX / scale - advance / 2
    for (const [j, glyph] of infos.entries()) {
      const p = positions[j]
      const d = font.glyphToPath(glyph.codepoint)
      if (d) {
        // Font units are y-up; flip into the SVG's y-down around the baseline.
        const x = (pen + p.xOffset) * scale
        const y = baseline - p.yOffset * scale
        markup += `<path transform="translate(${x.toFixed(2)} ${y.toFixed(
          2,
        )}) scale(${scale} ${-scale})" d="${d}"/>`
      }
      pen += p.xAdvance
    }
  }
  return { markup }
}
