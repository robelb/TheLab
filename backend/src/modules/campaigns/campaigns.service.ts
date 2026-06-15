import { desc, eq, isNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { campaigns, type Campaign } from '../../db/schema/index.js'
import {
  fetchImage,
  fetchImageOptional,
  type FetchedImage,
} from '../../customizer/fetchImage.js'
import {
  missingImageLlmConfigMessage,
  resolveImageLlmConfig,
} from '../../customizer/llmImageConfig.js'
import { fetchedImageFromInlineSvg } from '../../customizer/normalizeImageForAi.js'
import {
  fetchedImageFromDataUrl,
  generateProductPhoto,
} from '../../photoshoot/generate.js'
import {
  getProductById,
  searchProductsByText,
} from '../products/products.service.js'
import { buildCampaignKitImagePrompt } from '../../systemInstruction/campaign.js'
import { saveImage } from '../uploads/uploads.service.js'
import type { ProductWithCategory } from '../../types/product.js'
import type {
  CampaignBrandInput,
  CreateCampaignBody,
  UpdateCampaignBody,
} from './campaigns.schema.js'

const DEFAULT_BUNDLE_SIZE = 6

export interface HydratedCampaign extends Campaign {
  products: ProductWithCategory[]
}

/** Semantic query: the user's brief leads, then brand signals. */
function buildSemanticQuery(b: CampaignBrandInput, brief?: string | null): string {
  return [
    brief,
    b.industry,
    b.keywords?.join(', '),
    b.tagline,
    b.description,
    b.companyName,
  ]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join('. ')
}

/** Resolve the brand logo (url / data-uri / inline svg) to a FetchedImage. */
async function resolveLogoImage(
  logo?: string | null,
  logoType?: string | null,
): Promise<FetchedImage | undefined> {
  if (!logo) return undefined
  const value = logo.trim()
  if (!value) return undefined
  try {
    if (logoType === 'data-uri' || value.startsWith('data:')) {
      return await fetchedImageFromDataUrl(value, 'logo')
    }
    if (logoType === 'svg' || value.startsWith('<svg') || value.startsWith('<?xml')) {
      return await fetchedImageFromInlineSvg(value)
    }
    return (await fetchImageOptional(value, 'logo')) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Best-effort composite "kit" image: all bundle products together + the logo.
 * Returns null if image generation is unconfigured or fails — the campaign is
 * still useful with copy + product bundle.
 */
async function generateKitImage(
  brand: CampaignBrandInput,
  products: ProductWithCategory[],
  brief?: string | null,
): Promise<string | null> {
  const config = resolveImageLlmConfig()
  if (!config) {
    console.warn('[campaigns] kit image skipped:', missingImageLlmConfigMessage())
    return null
  }

  try {
    const fetched = await Promise.allSettled(
      products.map((p) => fetchImage(p.image, 'product')),
    )
    const productImages = fetched
      .filter(
        (r): r is PromiseFulfilledResult<FetchedImage> =>
          r.status === 'fulfilled',
      )
      .map((r) => r.value)

    if (productImages.length === 0) return null

    const logoImage = await resolveLogoImage(brand.logo, brand.logoType)
    const images = logoImage ? [...productImages, logoImage] : productImages

    const prompt = buildCampaignKitImagePrompt(
      brand,
      products.map((p) => p.name),
      Boolean(logoImage),
      brief,
    )

    const buffer = await generateProductPhoto(prompt, images, config, {
      size: '1536x1024',
    })
    return await saveImage(buffer.toString('base64'), { prefix: 'campaign' })
  } catch (err) {
    console.warn(
      '[campaigns] kit image generation failed:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

async function hydrate(c: Campaign): Promise<HydratedCampaign> {
  const products = (
    await Promise.all(
      c.productIds.map((id) => getProductById(id, c.domain ?? undefined)),
    )
  ).filter((p): p is ProductWithCategory => p !== null)
  return { ...c, products }
}

export async function generateCampaign(
  brand: CampaignBrandInput,
  bundleSize = DEFAULT_BUNDLE_SIZE,
  brief?: string | null,
): Promise<HydratedCampaign> {
  const query = buildSemanticQuery(brand, brief)

  // Vector search may fail if embeddings/Gemini are unavailable — a copy-only
  // draft is still valid, so swallow and continue with an empty bundle.
  const products = await searchProductsByText(query, bundleSize).catch((err) => {
    console.warn(
      '[campaigns] semantic search failed, continuing with empty bundle:',
      err instanceof Error ? err.message : err,
    )
    return [] as ProductWithCategory[]
  })

  // generateCampaignCopy is imported lazily to keep the LLM dep out of hot paths.
  const { generateCampaignCopy } = await import('./generateCampaignCopy.js')
  const copy = await generateCampaignCopy(
    brand,
    products.map((p) => p.name),
    brief,
  )

  const heroImageUrl = products.length
    ? await generateKitImage(brand, products, brief)
    : null

  const [row] = await db
    .insert(campaigns)
    .values({
      domain: brand.domain ?? null,
      title: copy.title,
      description: copy.description,
      status: 'draft',
      productIds: products.map((p) => p.id),
      heroImageUrl,
    })
    .returning()

  return hydrate(row)
}

/** Manually create a blank/draft campaign (no AI assembly). */
export async function createCampaign(
  input: CreateCampaignBody,
): Promise<HydratedCampaign> {
  const [row] = await db
    .insert(campaigns)
    .values({
      domain: input.domain ?? null,
      title: input.title,
      description: input.description ?? '',
      status: 'draft',
      productIds: input.productIds ?? [],
      heroImageUrl: null,
    })
    .returning()
  return hydrate(row)
}

export async function listCampaigns(domain?: string): Promise<HydratedCampaign[]> {
  const where = domain
    ? eq(campaigns.domain, domain)
    : isNull(campaigns.domain)
  const rows = await db
    .select()
    .from(campaigns)
    .where(where)
    .orderBy(desc(campaigns.updatedAt))
  return Promise.all(rows.map(hydrate))
}

export async function getCampaign(id: string): Promise<HydratedCampaign | null> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1)
  return row ? hydrate(row) : null
}

export async function updateCampaign(
  id: string,
  input: UpdateCampaignBody,
): Promise<HydratedCampaign | null> {
  const values: Record<string, unknown> = {}
  if (input.title !== undefined) values.title = input.title
  if (input.description !== undefined) values.description = input.description
  if (input.productIds !== undefined) values.productIds = input.productIds
  if (input.status !== undefined) values.status = input.status

  const [row] = await db
    .update(campaigns)
    .set(values)
    .where(eq(campaigns.id, id))
    .returning()
  return row ? hydrate(row) : null
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const deleted = await db
    .delete(campaigns)
    .where(eq(campaigns.id, id))
    .returning({ id: campaigns.id })
  return deleted.length > 0
}
