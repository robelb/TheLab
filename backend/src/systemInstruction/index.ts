/**
 * Central home for every instruction/prompt we send to an AI model.
 * Anything that builds text the model treats as instruction lives here.
 *
 *   - productPhotoshoot — AI product-photography briefs (dashboard)
 *   - brandCustomize    — login-time featured-product branding
 *   - brandExtraction   — website brand/design-token extraction
 *   - imageCaption      — image → catalog search query
 */
export * from './productPhotoshoot.js'
export * from './brandCustomize.js'
export * from './brandExtraction.js'
export * from './imageCaption.js'
export * from './campaign.js'
