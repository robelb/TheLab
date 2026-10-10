/**
 * Where we invoice and ship to, what shipping costs, and what VAT applies.
 *
 * One table for each, so the numbers live in one place: the checkout shows an
 * estimate from the copy in client/src/lib/shipping.ts, and a request is
 * priced here. The operator can still change shipping on confirmation.
 *
 * Rates are the action plan's figures until the full shipping sheet replaces
 * them. Shipping goes to EU addresses only: no customs documents yet.
 */

export type ShippingMethod = 'bulk' | 'individual' | 'mixed'
export type ShippingZone = 'DE' | 'ZONE_1'

/** EU member states, ISO 3166-1 alpha-2. */
export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR',
  'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI',
  'SK',
] as const

/** Who we make invoices out to: the EU plus the neighbours we sell to. */
export const INVOICE_COUNTRIES: readonly string[] = [...EU_COUNTRIES, 'CH', 'GB', 'LI', 'NO']

/** Where boxes can be sent. Outside the EU needs customs papers, which come later. */
export const SHIPPING_COUNTRIES: readonly string[] = EU_COUNTRIES

export const isEu = (country: string) =>
  (EU_COUNTRIES as readonly string[]).includes(country)

export function zoneFor(country: string): ShippingZone | null {
  if (country === 'DE') return 'DE'
  return isEu(country) ? 'ZONE_1' : null
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
