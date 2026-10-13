/**
 * Where we invoice and ship to, what shipping costs, and what VAT applies.
 *
 * A copy of backend/src/lib/shipping.ts, which is what a request is actually
 * priced with — this one lets the checkout show the same estimate as the
 * shopper changes country and shipping method. Change both together.
 *
 * Rates: "International Shipping Price List", valid from 9 November 2023;
 * Germany's from big little things' own domestic rates. Bulk = base price +
 * price per box (10 boxes to zone 1: €16.90 + 10 × €5.00 = €66.90); individual
 * = price per parcel for each box. Only destinations without customs
 * documents are offered — see the server copy.
 */

export type ShippingMethod = 'bulk' | 'individual' | 'mixed'
export type ShippingZone =
  | 'DE'
  | 'ZONE_1'
  | 'ZONE_1_NON_EU'
  | 'ZONE_2'
  | 'ZONE_2_NON_EU'
  | 'ZONE_3'
  | 'ZONE_3_NON_EU'
  | 'ZONE_4'
  | 'ZONE_5'
  | 'ZONE_6'

/** EU member states, ISO 3166-1 alpha-2. */
export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR',
  'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI',
  'SK',
] as const

/** Who we make invoices out to: the EU plus the neighbours we sell to. */
export const INVOICE_COUNTRIES: readonly string[] = [...EU_COUNTRIES, 'CH', 'GB', 'LI', 'NO']

/**
 * The zone of every country we ship to, as the price list assigns it. EU
 * countries only — no customs documents — and Cyprus is not on the list.
 */
const COUNTRY_ZONES: Record<string, ShippingZone> = {
  DE: 'DE',
  // Zone 1
  AT: 'ZONE_1', BE: 'ZONE_1', CZ: 'ZONE_1', DK: 'ZONE_1', FR: 'ZONE_1',
  LU: 'ZONE_1', NL: 'ZONE_1', PL: 'ZONE_1',
  // Zone 2
  HU: 'ZONE_2', IT: 'ZONE_2', SK: 'ZONE_2', SI: 'ZONE_2', ES: 'ZONE_2', SE: 'ZONE_2',
  // Zone 3
  BG: 'ZONE_3', HR: 'ZONE_3', EE: 'ZONE_3', FI: 'ZONE_3', GR: 'ZONE_3', IE: 'ZONE_3',
  LV: 'ZONE_3', LT: 'ZONE_3', MT: 'ZONE_3', PT: 'ZONE_3', RO: 'ZONE_3',
}

/** Where boxes can be sent: the countries above. */
export const SHIPPING_COUNTRIES: readonly string[] = Object.keys(COUNTRY_ZONES)

export const isEu = (country: string) =>
  (EU_COUNTRIES as readonly string[]).includes(country)

export function zoneFor(country: string): ShippingZone | null {
  return COUNTRY_ZONES[country] ?? null
}

/**
 * Per zone: a bulk shipment costs `bulkBase` plus `bulkPerBox` for each box;
 * an individual one costs `individualPerBox` for each box, each to its own
 * address.
 */
export const SHIPPING_RATES: Record<
  ShippingZone,
  { bulkBase: number; bulkPerBox: number; individualPerBox: number }
> = {
  DE: { bulkBase: 5.9, bulkPerBox: 2, individualPerBox: 5.9 },
  ZONE_1: { bulkBase: 16.9, bulkPerBox: 5, individualPerBox: 16.9 },
  ZONE_1_NON_EU: { bulkBase: 31.9, bulkPerBox: 6, individualPerBox: 31.9 },
  ZONE_2: { bulkBase: 16.9, bulkPerBox: 5, individualPerBox: 16.9 },
  ZONE_2_NON_EU: { bulkBase: 31.9, bulkPerBox: 6, individualPerBox: 31.9 },
  ZONE_3: { bulkBase: 16.9, bulkPerBox: 5, individualPerBox: 16.9 },
  ZONE_3_NON_EU: { bulkBase: 29.9, bulkPerBox: 8, individualPerBox: 29.9 },
  ZONE_4: { bulkBase: 38.9, bulkPerBox: 10, individualPerBox: 38.9 },
  ZONE_5: { bulkBase: 44.9, bulkPerBox: 20, individualPerBox: 44.9 },
  ZONE_6: { bulkBase: 55.9, bulkPerBox: 25, individualPerBox: 55.9 },
}

/** Customs documents, for when non-EU destinations are switched on. */
export const CUSTOMS_FEES = {
  /** One-time document preparation, per project. */
  perProject: 49.9,
  perBoxBulk: 0.5,
  perBoxIndividual: 2.85,
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
