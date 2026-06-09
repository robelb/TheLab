export interface CustomizePromptContext {
  companyName?: string | null
  hasLogo: boolean
  hasFavicon: boolean
}

/**
 * Build the single prompt sent for both OpenAI and Gemini.
 *
 * Images are passed in this order by the callers:
 *   1. Product photo (always first)
 *   2. Logo (if available)
 *   3. Favicon (if available)
 */
export function buildCustomizePrompt(ctx: CustomizePromptContext): string {
  const parts: string[] = []

  // ── What images are attached ─────────────────────────────────────────────
  const attached: string[] = ['the product photo']
  if (ctx.hasLogo) attached.push('the brand logo')
  if (ctx.hasFavicon) attached.push('the brand favicon')

  parts.push(`You have been given ${attached.join(', ')}.`)
  parts.push('')

  // ── Core task ────────────────────────────────────────────────────────────
  parts.push(
    'Your task: return the product photo with the brand printed on the product\'s print/branding area.',
  )
  parts.push('')

  // ── Brand mark choice ────────────────────────────────────────────────────
  if (ctx.hasLogo && ctx.hasFavicon) {
    parts.push(
      'Look at the print area size and shape on the product. Choose whichever mark — logo or favicon — fits that space better and will be most legible at that scale. You do not have to use both.',
    )
  } else if (ctx.hasLogo) {
    parts.push('Use the logo as the brand mark on the print area.')
  } else if (ctx.hasFavicon) {
    parts.push('Use the favicon as the brand mark on the print area.')
  }
  parts.push('')

  // ── Company name ─────────────────────────────────────────────────────────
  if (ctx.companyName?.trim()) {
    parts.push(
      `The company name is "${ctx.companyName.trim()}". You may add it inside the print area alongside the mark if it improves the design — it is optional.`,
    )
    parts.push('')
  }

  // ── Compositing rules ────────────────────────────────────────────────────
  parts.push('Design rules:')
  parts.push('- Place the brand mark ON the product surface, inside the visible print/branding zone. And remove zone indicator.')
  parts.push('- Match the product\'s perspective, curvature, lighting, and material so it looks printed or embossed.')
  parts.push('- Make sure the mark is clearly visible.')
  parts.push('- Keep the rest of the product photo exactly as it is: same framing, same background, nothing cropped.')
  parts.push('- Do NOT put the logo or any text outside the print area.')
  parts.push('- Do NOT produce a collage, banner, or split layout. Output one product photo with branding on it. same product photo size and aspect ratio.')
  parts.push('- As much as possible, keep the product photo background as it is and with same scale. if you can add more same color background and make the image ratio square.')

  return parts.join('\n')
}
