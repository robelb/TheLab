/**
 * Prices in the reader's own conventions.
 *
 * This was pinned to `en-US`, so a German shop quoting euros rendered
 * `€1,234.56` — the right currency in the wrong notation, which reads as a
 * mistake to exactly the customers being invoiced. `undefined` hands the choice
 * to the browser, so a German visitor sees `1.234,56 €` and an American one sees
 * what they expect. The currency itself still comes from the product.
 */
export function formatPrice(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
