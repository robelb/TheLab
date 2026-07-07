import { desc, eq, isNull } from 'drizzle-orm'
import { db, rawSql } from '../../db/index.js'
import {
  campaignVideos,
  campaigns,
  type Campaign,
  type CampaignVideo,
} from '../../db/schema/index.js'
import { embedText } from '../../services/embedding.js'
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
  CreateCampaignVideoBody,
  UpdateCampaignBody,
  UpdateCampaignVideoBody,
} from './campaigns.schema.js'

const DEFAULT_BUNDLE_SIZE = 6

/** Video without the bulky embedding vector (never sent to the client). */
export type CampaignVideoPublic = Omit<CampaignVideo, 'embedding'>

function toPublicVideo(v: CampaignVideo): CampaignVideoPublic {
  const { embedding: _embedding, ...rest } = v
  return rest
}

export interface HydratedCampaign extends Campaign {
  products: ProductWithCategory[]
  videos: CampaignVideoPublic[]
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
  const [products, videos] = await Promise.all([
    Promise.all(
      c.productIds.map((id) => getProductById(id, c.domain ?? undefined)),
    ).then((ps) => ps.filter((p): p is ProductWithCategory => p !== null)),
    db
      .select()
      .from(campaignVideos)
      .where(eq(campaignVideos.campaignId, c.id))
      .orderBy(desc(campaignVideos.createdAt)),
  ])
  return { ...c, products, videos: videos.map(toPublicVideo) }
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

/** Best-effort embedding — never block a campaign save if the service is down. */
async function tryEmbed(text: string): Promise<number[] | null> {
  try {
    return await embedText(text)
  } catch (err) {
    console.warn(
      '[campaigns] video embedding failed, saving without it:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
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

// ---------------------------------------------------------------------------
// Campaign videos (one campaign → many videos)
// ---------------------------------------------------------------------------

/** Add a video (already uploaded) to a campaign; embeds the description. */
export async function addCampaignVideo(
  campaignId: string,
  input: CreateCampaignVideoBody,
): Promise<CampaignVideoPublic | null> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)
  if (!campaign) return null

  const desc = input.description?.trim()
  const embedding = desc ? await tryEmbed(desc) : null

  const [row] = await db
    .insert(campaignVideos)
    .values({
      campaignId,
      url: input.url,
      description: input.description ?? null,
      orientation: input.orientation ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      priority: input.priority ?? 0,
      embedding: embedding ?? null,
    })
    .returning()
  return row ? toPublicVideo(row) : null
}

/** Update a video's metadata; re-embeds when the description changes. */
export async function updateCampaignVideo(
  videoId: string,
  input: UpdateCampaignVideoBody,
): Promise<CampaignVideoPublic | null> {
  const values: Record<string, unknown> = {}
  if (input.orientation !== undefined) values.orientation = input.orientation
  if (input.startsAt !== undefined) values.startsAt = input.startsAt
  if (input.endsAt !== undefined) values.endsAt = input.endsAt
  if (input.priority !== undefined) values.priority = input.priority
  if (input.description !== undefined) {
    values.description = input.description
    const desc = input.description?.trim()
    values.embedding = desc ? await tryEmbed(desc) : null
  }

  const [row] = await db
    .update(campaignVideos)
    .set(values)
    .where(eq(campaignVideos.id, videoId))
    .returning()
  return row ? toPublicVideo(row) : null
}

export async function deleteCampaignVideo(videoId: string): Promise<boolean> {
  const deleted = await db
    .delete(campaignVideos)
    .where(eq(campaignVideos.id, videoId))
    .returning({ id: campaignVideos.id })
  return deleted.length > 0
}

export interface ActiveCampaignVideo {
  id: string
  campaignId: string
  title: string
  videoUrl: string
  videoOrientation: 'portrait' | 'landscape' | null
  videoDescription: string | null
}

/**
 * Storefront feed: videos from approved campaigns whose display window is
 * currently open, scoped to the domain. When browse context (category/search)
 * is supplied, results are ordered by semantic relevance of the video
 * description embedding (embedded videos first), else by priority.
 */
export async function listActiveCampaignVideos(opts: {
  domain?: string
  category?: string
  q?: string
}): Promise<ActiveCampaignVideo[]> {
  const clauses: string[] = [
    "c.status = 'approved'",
    'v.url IS NOT NULL',
    '(v.starts_at IS NULL OR v.starts_at <= now())',
    '(v.ends_at IS NULL OR v.ends_at >= now())',
  ]
  clauses.push(
    opts.domain
      ? `c.domain = '${opts.domain.replace(/'/g, "''")}'`
      : 'c.domain IS NULL',
  )
  const whereClause = clauses.join(' AND ')

  const context = [opts.category, opts.q]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ')

  let vectorStr: string | null = null
  if (context) {
    const embedding = await tryEmbed(context)
    if (embedding) vectorStr = `[${embedding.join(',')}]`
  }

  // `<=>` is pgvector cosine distance; NULL embeddings sort last via the CASE.
  const orderClause = vectorStr
    ? `ORDER BY (v.embedding IS NULL) ASC, v.embedding <=> '${vectorStr}'::vector ASC, v.priority DESC`
    : 'ORDER BY v.priority DESC, v.created_at DESC'

  const rows = (await rawSql`
    SELECT v.id, v.campaign_id, c.title, v.url, v.orientation, v.description
    FROM campaign_videos v
    INNER JOIN campaigns c ON c.id = v.campaign_id
    WHERE ${rawSql.unsafe(whereClause)}
    ${rawSql.unsafe(orderClause)}
    LIMIT 12
  `) as Array<{
    id: string
    campaign_id: string
    title: string
    url: string
    orientation: string | null
    description: string | null
  }>

  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    title: r.title,
    videoUrl: r.url,
    videoOrientation:
      r.orientation === 'portrait' || r.orientation === 'landscape'
        ? r.orientation
        : null,
    videoDescription: r.description,
  }))
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const deleted = await db
    .delete(campaigns)
    .where(eq(campaigns.id, id))
    .returning({ id: campaigns.id })
  return deleted.length > 0
}
