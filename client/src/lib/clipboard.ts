/**
 * Copy text to the clipboard, everywhere.
 *
 * `navigator.clipboard` only exists in a secure context — over plain http on a
 * LAN address (the usual way a build gets tested on a phone) it's undefined, so
 * the deprecated-but-universal `execCommand` path is kept as a fallback.
 *
 * Returns whether the text made it to the clipboard, so callers can tell the
 * user when it didn't instead of appearing to have worked.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or a non-focused document — try the legacy path.
    }
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  // Off-screen but still selectable; `readOnly` stops the mobile keyboard.
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)

  try {
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}
