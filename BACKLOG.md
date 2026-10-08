# Backlog

Things we have decided to do later. Add new items at the bottom; remove an item once it ships.

## Company details (§35a GmbHG) on invoices

**What:** Add one small line to the invoice footer with the managing directors, register court, register number and registered seat, e.g.

> Geschäftsführer: Hannes Brellochs, Christoph Martin Quitz · Registergericht: Amtsgericht München · HRB 265312 · Sitz der Gesellschaft: München

**Why:** German law (§35a GmbHG) requires these on every business letter a GmbH sends, and invoices count as business letters. Leaving them off doesn't make an invoice invalid for VAT. The risk is a fine from the register court (Zwangsgeld, up to €5,000) or, more rarely, a competitor's warning letter (Abmahnung). Our JTL invoices don't have the line either, so we left it off the shop invoice to keep the two the same. Ask the tax advisor before adding it.

**How:** The values are already configured (`SELLER_MANAGING_DIRECTORS`, `SELLER_REGISTER_COURT`, `SELLER_REGISTER_NUMBER` in `backend/src/config/env.ts`) and copied onto every invoice when it is issued. Only the footer in `backend/src/services/invoicePdf.ts` needs the extra line, under the three footer columns. The JTL template should get the same line.
