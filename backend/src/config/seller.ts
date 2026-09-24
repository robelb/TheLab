import { env } from './env.js'
import type { InvoiceSeller } from '../db/schema/index.js'

/**
 * Our own details, as printed on an invoice.
 *
 * Read from the environment rather than stored in the database because they
 * change about once a decade and whoever changes them is deploying anyway. Each
 * invoice copies them when it is issued, so changing one here never rewrites an
 * invoice that already went out.
 */
export function sellerDetails(): InvoiceSeller {
  return {
    name: env.SELLER_NAME,
    street: env.SELLER_STREET,
    zip: env.SELLER_ZIP,
    city: env.SELLER_CITY,
    country: env.SELLER_COUNTRY,
    email: env.SELLER_EMAIL || null,
    phone: env.SELLER_PHONE || null,
    website: env.SELLER_WEBSITE || null,
    vatId: env.SELLER_VAT_ID || null,
    taxNumber: env.SELLER_TAX_NUMBER || null,
    registerCourt: env.SELLER_REGISTER_COURT || null,
    registerNumber: env.SELLER_REGISTER_NUMBER || null,
    managingDirectors: env.SELLER_MANAGING_DIRECTORS || null,
    bankName: env.SELLER_BANK_NAME || null,
    iban: env.SELLER_IBAN || null,
    bic: env.SELLER_BIC || null,
    paymentTermDays: env.PAYMENT_TERM_DAYS,
  }
}

/**
 * What is still missing before an invoice may be issued.
 *
 * An invoice without our address, a tax id or somewhere to pay is not one a
 * customer can book, so confirmation refuses rather than sending it.
 */
export function missingSellerDetails(): string[] {
  const s = sellerDetails()
  const missing: string[] = []
  if (!s.name) missing.push('SELLER_NAME')
  if (!s.street) missing.push('SELLER_STREET')
  if (!s.zip) missing.push('SELLER_ZIP')
  if (!s.city) missing.push('SELLER_CITY')
  if (!s.iban) missing.push('SELLER_IBAN')
  if (!s.vatId && !s.taxNumber) missing.push('SELLER_VAT_ID or SELLER_TAX_NUMBER')
  return missing
}
