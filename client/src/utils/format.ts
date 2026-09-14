import { currentLocale } from '@/i18n'

/** The BCP-47 tag each of our languages formats numbers and dates with. */
const INTL_LOCALE: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
}

function intlLocale(): string {
  return INTL_LOCALE[currentLocale()] ?? 'de-DE'
}

/**
 * Prices in the reader's own conventions.
 *
 * This was pinned to `en-US`, so a German shop quoting euros rendered
 * `€1,234.56` — the right currency in the wrong notation, which reads as a
 * mistake to exactly the customers being invoiced. It then followed the
 * browser, which was closer but disagreed with the language on screen: a German
 * page on an English browser priced things the English way.
 *
 * It follows the chosen language now, so the words and the numbers always
 * agree. The currency itself still comes from the product.
 */
export function formatPrice(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(intlLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** A date, written the way the current language writes dates. */
export function formatDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(intlLocale(), options).format(date)
}

export function formatDateTime(value: string | Date): string {
  return formatDate(value, { dateStyle: 'medium', timeStyle: 'short' })
}
