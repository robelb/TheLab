/**
 * Central home for every instruction/prompt we send to an AI model.
 * Anything that builds text the model treats as instruction lives here.
 *
 *   - productPhotoshoot — AI product-photography briefs (dashboard)
 *   - brandCustomize    — login-time featured-product branding
 *   - boxCustomization  — printing a shopper's design onto a gift box
 *   - brandExtraction   — website brand/design-token extraction
 *   - imageCaption      — image → catalog search query
 *   - printScale        — shared scale/typography rules for every printed mark
 */
export * from './productPhotoshoot.js'
export * from './brandCustomize.js'
export * from './boxCustomization.js'
export * from './brandExtraction.js'
export * from './imageCaption.js'
export * from './campaign.js'
export * from './printScale.js'
