/**
 * Encodes the "AI Product Photography" prompt system (big little things, 2026).
 *
 * The 3-image logic:
 *   - product reference  (exact shape/colour/material) — always present, and is
 *     the BASE image the model edits, so the product stays faithful.
 *   - style reference    (composition, mood, lighting)  — optional
 *   - branding reference (logo / print / slogan)        — optional, defaults to
 *     the company logo.
 *
 * We always know what we want, so the caller picks a scene + aspect ratio and we
 * assemble one art-director brief — a SINGLE photo, never a grid of variations.
 */

export interface SceneType {
  id: string
  label: string
  /** Scene-specific staging guidance woven into the brief. */
  instruction: string
}

export const SCENE_TYPES: SceneType[] = [
  {
    id: 'studio-hero',
    label: 'Studio hero',
    instruction:
      'Stage it as a hero shot on a minimal pedestal or clean surface, with soft directional studio lighting and a clean, uncluttered background.',
  },
  {
    id: 'editorial-tabletop',
    label: 'Editorial tabletop',
    instruction:
      'Style it in a refined, minimal tabletop scene with soft natural light. Include at most one or two subtle complementary props (a notebook, pen, or cup) only if they genuinely support the scene.',
  },
  {
    id: 'work-desk-lifestyle',
    label: 'Work-desk lifestyle',
    instruction:
      'Place it in a warm work-from-home desk setting with a laptop and soft natural light. A person may be present and interacting subtly, but the product stays the clear subject.',
  },
  {
    id: 'human-interaction',
    label: 'Human interaction',
    instruction:
      'Show natural hands interacting with it — holding it or placing it into the scene. Keep hands realistic and well-proportioned, and the product central.',
  },
  {
    id: 'wearable-fashion',
    label: 'Wearable fashion',
    instruction:
      'Show a single model wearing it in a modern, effortless editorial setting, with realistic anatomy. The worn product and its branding are the focus.',
  },
]

export function isValidSceneType(id: string): boolean {
  return SCENE_TYPES.some((s) => s.id === id)
}

export interface AspectRatio {
  id: string
  label: string
  /** Size string accepted by OpenAI gpt-image-1 `images.edit`. */
  openaiSize: '1024x1024' | '1024x1536' | '1536x1024'
  /** Human description woven into the prompt (helps providers without a size param). */
  promptLabel: string
}

export const ASPECT_RATIOS: AspectRatio[] = [
  {
    id: 'square',
    label: 'Square 1:1',
    openaiSize: '1024x1024',
    promptLabel: 'a square 1:1',
  },
  {
    id: 'portrait',
    label: 'Portrait 2:3',
    openaiSize: '1024x1536',
    promptLabel: 'a vertical portrait 2:3',
  },
  {
    id: 'landscape',
    label: 'Landscape 3:2',
    openaiSize: '1536x1024',
    promptLabel: 'a horizontal landscape 3:2',
  },
]

export function resolveAspectRatio(id: string | undefined): AspectRatio {
  return ASPECT_RATIOS.find((r) => r.id === id) ?? ASPECT_RATIOS[0]
}

export interface BuildPhotoshootPromptInput {
  sceneType: string
  aspectRatio: string
  productName?: string | null
  hasStyle: boolean
  hasBranding: boolean
  /** True when refining a previously generated image (iterative chat turn). */
  hasBase?: boolean
  /** Optional extra instructions typed by the user. */
  extra?: string | null
}

/**
 * Build a single, coherent photographer's brief. Written as direct prose rather
 * than a long bullet list — image models follow an intentful brief far more
 * reliably than a checklist, and a checklist of references invites a montage.
 *
 * Two modes, driven by whether a style image is supplied:
 *   - style-driven (hasStyle): the style image IS the scene and the edit base.
 *     We keep that scene and place the product into it + apply branding — we do
 *     NOT invent a new scene.
 *   - scene-driven (no style): the product is the base; we stage it in the
 *     chosen scene type.
 */
export function buildPhotoshootPrompt(input: BuildPhotoshootPromptInput): string {
  const scene =
    SCENE_TYPES.find((s) => s.id === input.sceneType) ?? SCENE_TYPES[0]
  const ratio = resolveAspectRatio(input.aspectRatio)

  const productName = input.productName?.trim()
  const subject = productName ? `the ${productName}` : 'the product'

  const p: string[] = []

  if (input.hasBase) {
    // ── Refine mode: iterate on a previously generated image (chat follow-up).
    p.push(
      'Act as an expert photo retoucher. The FIRST image is the current product photograph. Apply the requested change to it while keeping everything else identical — same product, composition, scene, framing, lighting and colours. Produce ONE single edited photograph, never a grid, collage, or set of variations.',
    )

    const refs: string[] = []
    refs.push(
      'CURRENT image (the first image) — the photo to edit. Preserve it and change only what the instruction asks.',
    )
    refs.push(
      `PRODUCT reference — keep ${subject} identical to this (shape, proportions, colour, material, details).`,
    )
    if (input.hasBranding) {
      refs.push('BRANDING reference — the brand mark that should remain on the product.')
    }
    p.push(
      `You are given these reference images:\n${refs.map((r) => `- ${r}`).join('\n')}`,
    )

    p.push(
      input.extra?.trim()
        ? `Requested change: ${input.extra.trim()}`
        : 'Refine for higher realism and quality without otherwise changing the image.',
    )

    if (input.hasBranding) {
      p.push(
        "Keep this brand's logo (from the BRANDING reference) on the product — sharp, correctly coloured, undistorted and clearly legible. Make sure no other, different, placeholder or made-up logo, brand name or wordmark appears anywhere in the image (product, packaging, screens, wall art or signage); replace any such mark with this brand's logo or remove it.",
      )
    }
  } else if (input.hasStyle) {
    // ── Style-driven: keep the style image as the scene, drop the product in.
    p.push(
      'Act as an expert commercial product photographer and compositor. Edit the FIRST image (the scene) by placing the given product into it. Produce ONE single, photorealistic photograph — never a grid, collage, contact sheet, set of variations, or split/paneled layout.',
    )

    const refs: string[] = []
    refs.push(
      'SCENE image (the first image) — KEEP this scene. Preserve its composition, camera angle, framing, background, environment, lighting and mood exactly. Do not invent, swap, or regenerate a different scene or background.',
    )
    refs.push(
      `PRODUCT reference — the exact product to place into the scene. Reproduce ${subject} faithfully: identical shape, proportions, colour, material, texture and details. Do not redesign, recolour, or reshape it.`,
    )
    if (input.hasBranding) {
      refs.push('BRANDING reference — the logo/artwork to apply to the product.')
    }
    p.push(
      `You are given these reference images:\n${refs.map((r) => `- ${r}`).join('\n')}`,
    )

    p.push(
      `Place ${subject} from the PRODUCT reference into the scene as the clear hero subject, sitting naturally and believably — matched to the scene's perspective, scale, lighting direction and shadows so it looks truly photographed there. If the scene already contains a focal product or placeholder, replace it with this product. Keep everything else in the scene unchanged.`,
    )
  } else {
    // ── Scene-driven: the product is the base; stage it in the chosen scene.
    p.push(
      'Act as an expert commercial product photographer and retoucher. Produce ONE single, photorealistic product photograph — one product, one scene, one frame. The result is a single finished photo and must never be a grid, collage, contact sheet, sheet of thumbnails, set of angles or variations, or a split/paneled layout.',
    )

    const refs: string[] = []
    refs.push(
      `PRODUCT reference — the exact product to photograph and the base of the image. Reproduce ${subject} with complete fidelity: identical shape, proportions, colour, material, texture and details. Do not redesign, recolour, reshape, or replace it.`,
    )
    if (input.hasBranding) {
      refs.push('BRANDING reference — the logo/artwork to apply to the product.')
    }
    p.push(
      `You are given these reference images:\n${refs.map((r) => `- ${r}`).join('\n')}`,
    )

    p.push(`Scene: ${scene.instruction}`)
  }

  // ── Branding application — only for fresh generations (refine keeps existing).
  if (input.hasBranding && !input.hasBase) {
    p.push(
      'BRANDING IS CRITICAL — get this exactly right:\n' +
        "- Apply the EXACT logo/mark from the BRANDING reference onto the product's main branding area so it looks genuinely printed, embroidered or embossed — following the surface's perspective, curvature, folds, lighting and material. It must be sharp, correctly coloured, undistorted, properly sized and clearly legible.\n" +
        '- This is the ONLY brand allowed anywhere in the image. Scan the whole scene — the product, packaging, tags, screens, and especially any wall art, posters, signage or background logos — and REPLACE every other, different, placeholder, or made-up logo, brand name or wordmark with THIS brand\'s logo, or remove it entirely.\n' +
        '- Never invent, keep, or show any competing or unrelated brand. Reproduce the supplied logo faithfully; do not redraw, restyle, recolour, mirror or add extra text to it.',
    )
  }

  // ── Framing + aspect ratio + single-subject discipline — shared.
  // The output is always rendered at the chosen aspect ratio.
  p.push(
    `Make ${subject} the single hero of the shot. Keep the entire product inside the frame — its full width and full height — well placed with comfortable margins; never crop or cut off any part of it. The final image must be ${ratio.promptLabel} (${ratio.label}) image. Produce just this one scene.`,
  )

  if (input.extra?.trim()) {
    p.push(`Additional art direction: ${input.extra.trim()}`)
  }

  p.push(
    'Render it as high-end commercial photography: realistic materials and textures, accurate colour, and a clean, intentional composition.',
  )

  p.push(
    'Avoid: multiple images, grids, collages, contact sheets, panels or variations; duplicated or extra products; a cropped or distorted product; warped or illegible branding; extra logos or text; distorted anatomy or hands; and plastic, cheap, or obvious-mockup looks.',
  )

  p.push(
    'The final image should feel like premium commercial photography, not a generic AI image or a flat mockup.',
  )

  return p.join('\n\n')
}
