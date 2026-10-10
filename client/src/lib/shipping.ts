/**
 * Where we invoice and ship to, what shipping costs, and what VAT applies.
 *
 * Mirrors backend/src/lib/shipping.ts, which is what a request is actually
 * priced with — this copy lets the checkout show the same estimate as the
 * shopper changes country and shipping method. Change both together.
 */

export type ShippingMethod = 'bulk' | 'individual' | 'mixed'
export type ShippingZone = 'DE' | 'ZONE_1'

export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR',
  'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI',
  'SK',
] as const

export const INVOICE_COUNTRIES: readonly string[] = [...EU_COUNTRIES, 'CH', 'GB', 'LI', 'NO']
export const SHIPPING_COUNTRIES: readonly string[] = EU_COUNTRIES

export const isEu = (country: string) =>
  (EU_COUNTRIES as readonly string[]).includes(country)

export function zoneFor(country: string): ShippingZone | null {
  if (country === 'DE') return 'DE'
  return isEu(country) ? 'ZONE_1' : null
}

export const SHIPPING_RATES: Record<
  ShippingZone,
  { bulkBase: number; bulkPerBox: number; individualPerBox: number }
> = {
  DE: { bulkBase: 5.9, bulkPerBox: 2, individualPerBox: 5.9 },
  ZONE_1: { bulkBase: 16.9, bulkPerBox: 5, individualPerBox: 16.9 },
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** See `shippingCost` on the server. Null for a country we do not ship to. */
export function shippingCost(params: {
  method: ShippingMethod
  country: string
  boxes: number
  bulkBoxes?: number | null
}): number | null {
  const zone = zoneFor(params.country)
  if (!zone) return null
  const rate = SHIPPING_RATES[zone]
  const boxes = Math.max(0, params.boxes)
  const bulk = (n: number) => rate.bulkBase + rate.bulkPerBox * Math.max(1, n)
  const individual = (n: number) => rate.individualPerBox * n

  if (params.method === 'individual') return round2(individual(Math.max(1, boxes)))
  if (params.method === 'mixed') {
    const together = Math.min(Math.max(1, params.bulkBoxes ?? 1), Math.max(1, boxes - 1))
    return round2(bulk(together) + individual(boxes - together))
  }
  return round2(bulk(boxes))
}

/** The German rate at home, none on invoices to other countries. */
export const HOME_VAT_RATE = 19

export function vatRateFor(country: string | null | undefined): number {
  return !country || country === 'DE' ? HOME_VAT_RATE : 0
}

const VAT_PREFIX: Record<string, string> = { GR: 'EL' }

export const vatIdRequired = (country: string) => isEu(country) && country !== 'DE'

export const normalizeVatId = (v: string) => v.replace(/[\s.-]/g, '').toUpperCase()

export function vatIdLooksValid(country: string, vatId: string): boolean {
  const id = normalizeVatId(vatId)
  if (country === 'DE') return /^DE\d{9}$/.test(id)
  if (!isEu(country)) return id.length >= 4 && id.length <= 20
  const prefix = VAT_PREFIX[country] ?? country
  return new RegExp(`^${prefix}[0-9A-Z]{2,13}$`).test(id)
}

/** What a VAT ID for the country starts with, for the placeholder. */
export const vatIdPrefix = (country: string) => VAT_PREFIX[country] ?? country

/** Countries as `{ code, name }` in the reader's language, Germany first. */
export function countryOptions(
  codes: readonly string[],
  locale: string,
): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    names = null
  }
  const options = codes.map((code) => ({ code, name: names?.of(code) ?? code }))
  const home = options.filter((o) => o.code === 'DE')
  const rest = options
    .filter((o) => o.code !== 'DE')
    .sort((a, b) => a.name.localeCompare(b.name, locale))
  return [...home, ...rest]
}
