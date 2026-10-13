/**
 * Where we invoice and ship to, what shipping costs, and what VAT applies.
 *
 * One table for each, so the numbers live in one place: the checkout shows an
 * estimate from a copy of this file (client/src/lib/shipping.ts — change both
 * together), and a request is priced here. The operator can still change
 * shipping on confirmation.
 *
 * Rates: "International Shipping Price List", valid from 9 November 2023,
 * for every zone; Germany's from big little things' own domestic rates. A
 * bulk (consolidated) shipment costs the zone's base price plus a price per
 * box — the list's own example, 10 boxes to zone 1, is €16.90 + 10 × €5.00 =
 * €66.90. An individual (single-parcel) shipment costs the price per parcel
 * for each box.
 *
 * Boxes go only where no customs documents are needed: Germany and the EU
 * countries on the list. Everywhere else needs them (€49.90 per project, plus
 * €0.50 per box consolidated or €2.85 per box single-parcel), which is parked
 * scope — the rates are here so switching a zone on is a small change.
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

/**
 * What shipping costs.
 *
 * `boxes` is the number of gift boxes in the order. Loose products travel with
 * the bulk shipment, so an order of loose products alone is one parcel.
 * `bulkBoxes` is the mixed split: that many go together, the rest one by one.
 * Null when the country is not one we ship to.
 */
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

/**
 * The VAT rate on an invoice to `country`: the German rate at home, none
 * elsewhere — reverse charge inside the EU (with the buyer's VAT ID), not
 * taxable in Germany outside it.
 */
export function vatRateFor(country: string | null | undefined, homeRate: number): number {
  return !country || country === 'DE' ? homeRate : 0
}

/** Greece files its VAT IDs as EL, not GR. */
const VAT_PREFIX: Record<string, string> = { GR: 'EL' }

/** An EU business outside Germany is only invoiced without VAT on its VAT ID. */
export const vatIdRequired = (country: string) => isEu(country) && country !== 'DE'

/** A VAT ID as it prints: no spaces, dots or dashes, upper case. */
export const normalizeVatId = (v: string) => v.replace(/[\s.-]/g, '').toUpperCase()

/**
 * Whether a VAT ID looks right for the billing country — the country prefix
 * and a plausible length. Not a VIES lookup; the operator checks that.
 */
export function vatIdLooksValid(country: string, vatId: string): boolean {
  const id = normalizeVatId(vatId)
  if (country === 'DE') return /^DE\d{9}$/.test(id)
  if (!isEu(country)) return id.length >= 4 && id.length <= 20
  const prefix = VAT_PREFIX[country] ?? country
  return new RegExp(`^${prefix}[0-9A-Z]{2,13}$`).test(id)
}

/**
 * Why an invoice carries no VAT, as it has to say on it. Gift boxes are goods:
 * to an EU business it is a tax-exempt intra-Community supply, outside the EU
 * an export. Wording to be confirmed by accounting.
 */
export function zeroVatReason(
  country: string | null | undefined,
  locale: 'de' | 'en',
): { short: string; note: string } {
  const eu = Boolean(country && isEu(country))
  if (locale === 'de') {
    return eu
      ? {
          short: 'innergemeinschaftliche Lieferung',
          note: 'Steuerfreie innergemeinschaftliche Lieferung gem. § 4 Nr. 1b i. V. m. § 6a UStG.',
        }
      : {
          short: 'Ausfuhrlieferung',
          note: 'Steuerfreie Ausfuhrlieferung gem. § 4 Nr. 1a i. V. m. § 6 UStG.',
        }
  }
  return eu
    ? {
        short: 'intra-Community supply',
        note: 'Tax-exempt intra-Community supply (Section 4 No. 1b with Section 6a German VAT Act).',
      }
    : {
        short: 'export',
        note: 'Tax-exempt export delivery (Section 4 No. 1a with Section 6 German VAT Act).',
      }
}
