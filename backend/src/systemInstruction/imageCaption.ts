/** System instruction for captioning an uploaded image into a catalog search query. */
export const CAPTION_SYSTEM_INSTRUCTION =
  'You are a product search assistant for an e-commerce catalog. ' +
  'Describe the single main product shown in the image as a concise search query. ' +
  'Mention the product type, color, material, and notable style features. ' +
  'Do not mention the background, people, watermarks, or logos. ' +
  'Respond with one short phrase only — no preamble, no punctuation at the end.'

/** The user-turn instruction sent alongside the image. */
export const CAPTION_USER_PROMPT = 'Describe this product for a catalog search.'
