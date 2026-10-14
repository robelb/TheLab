import {
  CUSTOMIZE_DEFAULT_TEMPLATE,
} from './brandCustomize.js'
import {
  CAMPAIGN_SYSTEM_INSTRUCTION,
  KIT_IMAGE_DEFAULT_TEMPLATE,
} from './campaign.js'
import { SYSTEM_INSTRUCTION as BRAND_EXTRACTION_INSTRUCTION } from './brandExtraction.js'
import { BOX_HERO_DEFAULT_TEMPLATE } from './boxHero.js'

export interface InstructionPlaceholder {
  name: string
  description: string
}

/**
 * A prompt that super admins can override from the dashboard.
 *
 * `defaultTemplate` is the built-in prompt with its runtime data blocks
 * expressed as `{{placeholders}}` — it is what the admin UI pre-fills the
 * editor with, and what the built-in behaviour corresponds to. When no active
 * override exists in the DB, the code does NOT render this template; it runs
 * the original builder functions, so pre-feature behaviour is untouched.
 */
export interface InstructionDefinition {
  key: string
  title: string
  description: string
  placeholders: InstructionPlaceholder[]
  defaultTemplate: string
}

export const INSTRUCTION_DEFINITIONS: InstructionDefinition[] = [
  {
    key: 'brand-customize',
    title: 'Product branding (onboarding)',
    description:
      'Prints the company logo onto each featured product when a company onboards (and via the /api/extract preview). Sent to the image model together with the product photo and the logo.',
    placeholders: [
      { name: 'companyName', description: 'The company name, or empty.' },
      {
        name: 'referenceImages',
        description:
          'The numbered list describing the attached images (product photo, logo, favicon) — varies with what was fetched.',
      },
      {
        name: 'markSelection',
        description:
          'One line telling the model which mark to use (logo vs favicon).',
      },
      {
        name: 'measuredMarkFacts',
        description:
          'Measured ground truth about the logo: aspect ratio, line count, exact colours. Empty when measurement failed.',
      },
      {
        name: 'productFacts',
        description:
          'THE PRODUCT block: the product name and catalogue description, so placement follows what the item is. Empty when unknown.',
      },
      {
        name: 'companyNameSection',
        description:
          'The optional company-name paragraph. Empty when the company has no name.',
      },
    ],
    defaultTemplate: CUSTOMIZE_DEFAULT_TEMPLATE,
  },
  {
    key: 'campaign-kit-image',
    title: 'Bundle image (dashboard campaigns)',
    description:
      'Renders the composite gift-box photo for a campaign bundle built in the dashboard: all products in one open kraft box, logo on every product. The shop box builder uses "Box photo (box builder)" instead.',
    placeholders: [
      { name: 'companyName', description: 'The company name, or empty.' },
      { name: 'productCount', description: 'Number of products in the box.' },
      {
        name: 'referenceImages',
        description:
          'The list mapping attached images to products (image k = product k; logo last).',
      },
      {
        name: 'productSet',
        description: 'The numbered PRODUCT SET block listing every product.',
      },
      {
        name: 'scene',
        description:
          'The SCENE block: the chosen gift box and filling material, or the default kraft box when the campaign has none.',
      },
      {
        name: 'measuredLogoFacts',
        description:
          'Measured ground truth about the logo: aspect ratio, line count, exact colours. Empty when measurement failed.',
      },
    ],
    defaultTemplate: KIT_IMAGE_DEFAULT_TEMPLATE,
  },
  {
    key: 'box-hero-image',
    title: 'Box photo (box builder)',
    description:
      'Renders the photo on the review step of the shop and collection box builder: the closed gift box standing at the back, the chosen products grouped in front of it, warm studio light. Sent with one photo per product, then the chosen packaging, then the chosen logo sticker.',
    placeholders: [
      { name: 'productCount', description: 'Number of products in the box.' },
      {
        name: 'referenceImages',
        description: 'The list mapping attached images to products (image k = product k; then the packaging, then the logo sticker).',
      },
      {
        name: 'productSet',
        description: 'The numbered product list, with customer-designed products marked.',
      },
      {
        name: 'packaging',
        description: 'One line naming the chosen box or bag and how it stands in the shot, plus where the chosen logo sticker sits on it.',
      },
      { name: 'finalCheck', description: 'The closing check, with the product count filled in.' },
    ],
    defaultTemplate: BOX_HERO_DEFAULT_TEMPLATE,
  },
  {
    key: 'campaign-copy',
    title: 'Campaign copy writer (system instruction)',
    description:
      'System instruction for generating a campaign title + marketing description from brand signals and the bundle products. The user message (brand data, product list, brief) is built separately.',
    placeholders: [],
    defaultTemplate: CAMPAIGN_SYSTEM_INSTRUCTION,
  },
  {
    key: 'brand-extraction',
    title: 'Brand extraction (system instruction)',
    description:
      'System instruction for extracting brand identity (colors, fonts, logo) from a website’s HTML during onboarding. The HTML itself is sent as the user message.',
    placeholders: [],
    defaultTemplate: BRAND_EXTRACTION_INSTRUCTION,
  },
]

export function getInstructionDefinition(
  key: string,
): InstructionDefinition | undefined {
  return INSTRUCTION_DEFINITIONS.find((d) => d.key === key)
}
