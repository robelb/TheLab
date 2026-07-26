import { desc, eq, isNull } from 'drizzle-orm'
import { db, rawSql } from '../../db/index.js'
import {
  campaignVideos,
  campaigns,
  companies,
  type Campaign,
  type CampaignVideo,
} from '../../db/schema/index.js'
import { embedText } from '../../services/embedding.js'
import {
  getBrandImageAssetsFromExtraction,
  hasAnyBrandImage,
  normalizeBrandImageUrls,
} from '../../customizer/brandAssets.js'
import { fetchBrandImages } from '../../customizer/fetchBrandImages.js'
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

/** Bound an AI call so an unreachable/slow provider degrades instead of hanging. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

const SEARCH_TIMEOUT_MS = 15_000
const COPY_TIMEOUT_MS = 25_000
const KIT_IMAGE_TIMEOUT_MS = 120_000

/**
 * A hero-image job left `pending` for longer than this (with no in-process job
 * running) was interrupted — a server restart, most likely. Reported as failed
 * so the UI offers a retry instead of spinning forever.
 */
const HERO_IMAGE_STALE_MS = KIT_IMAGE_TIMEOUT_MS + 60_000

/** Video without the bulky embedding vector (never sent to the client). */
export type CampaignVideoPublic = Omit<CampaignVideo, 'embedding'>

function toPublicVideo(v: CampaignVideo): CampaignVideoPublic {
  const { embedding: _embedding, ...rest } = v
  return rest
}

export interface HydratedCampaign extends Campaign {
  products: ProductWithCategory[]
  videos: CampaignVideoPublic[]
  /** The hero image no longer matches the bundle (regeneration is available). */
  heroImageStale: boolean
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

/** The logo to brand the bundle products with, plus the name to reference it by. */
interface BundleBrand {
  logo: FetchedImage
  companyName?: string | null
}

/** Logo straight off the request payload (url / data-uri / inline svg). */
async function logoFromBrandInput(
  brand: CampaignBrandInput,
): Promise<FetchedImage | undefined> {
  const value = brand.logo?.trim()
  if (!value) return undefined
  try {
    if (brand.logoType === 'data-uri' || value.startsWith('data:')) {
      return await fetchedImageFromDataUrl(value, 'logo')
    }
    if (
      brand.logoType === 'svg' ||
      value.startsWith('<svg') ||
      value.startsWith('<?xml')
    ) {
      return await fetchedImageFromInlineSvg(value)
    }
    return (await fetchImageOptional(value, 'logo')) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Logo from the company's persisted brand extraction. This is the path a
 * regeneration takes — a campaign row only knows its `domain`, so the logo is
 * looked up rather than passed in. Falls back to the favicon, like the
 * product customizer does.
 */
async function logoFromCompany(
  domain: string | null,
): Promise<BundleBrand | undefined> {
  if (!domain) return undefined
  const [company] = await db
    .select({ name: companies.name, brand: companies.brand })
    .from(companies)
    .where(eq(companies.domain, domain))
    .limit(1)
  if (!company?.brand) return undefined

  const assets = getBrandImageAssetsFromExtraction(company.brand)
  if (!hasAnyBrandImage(assets)) return undefined

  try {
    const fetched = await fetchBrandImages(normalizeBrandImageUrls(assets))
    const logo = fetched.logo ?? fetched.favicon
    return logo
      ? { logo, companyName: assets.companyName ?? company.name }
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Composite "kit" image: the whole bundle laid out in one open gift box, with
 * the company logo branded onto every product — see `buildCampaignKitImagePrompt`.
 *
 * Throws with a user-facing message when it can't produce an image, so the
 * caller can either surface the reason (manual regeneration) or swallow it
 * (campaign assembly, where copy + bundle are still useful on their own).
 */
async function generateKitImage(
  products: ProductWithCategory[],
  brand?: BundleBrand,
): Promise<string> {
  const config = resolveImageLlmConfig()
  if (!config) throw new Error(missingImageLlmConfigMessage())
  if (products.length === 0) {
    throw new Error('Add at least one product to the bundle first.')
  }

  // Prefer the company's already-branded product shot when one exists — the
  // logo is then carried by the reference itself, so placement matches what the
  // shop shows. Otherwise the base catalog image, branded by the prompt.
  const fetched = await Promise.allSettled(
    products.map((p) => fetchImage(p.customizedImage ?? p.image, 'product')),
  )
  // A product whose image can't be fetched is dropped rather than failing the
  // whole render — but the prompt must then match what we actually send.
  const usable = products
    .map((product, i) => ({ product, result: fetched[i] }))
    .filter(
      (
        entry,
      ): entry is {
        product: ProductWithCategory
        result: PromiseFulfilledResult<FetchedImage>
      } => entry.result.status === 'fulfilled',
    )

  if (usable.length === 0) {
    throw new Error('None of the bundle product images could be loaded.')
  }

  // Order matters: products first (the first image is the edit base), logo last.
  const images = usable.map((e) => e.result.value)
  if (brand) images.push(brand.logo)

  const prompt = buildCampaignKitImagePrompt(
    usable.map((e) => e.product.name),
    { hasLogo: Boolean(brand), companyName: brand?.companyName },
  )
  const buffer = await generateProductPhoto(prompt, images, config, {
    size: '1024x1024',
  })
  return saveImage(buffer.toString('base64'), { prefix: 'campaign' })
}

/**
 * Campaigns are still keyed by `domain` (company_id is a later phase), but the
 * product image overlay is company-scoped — resolve the owning company from the
 * campaign's domain so branded tiles work and we never pass a domain where a
 * company UUID is expected.
 */
async function companyIdForDomain(
  domain: string | null,
): Promise<string | undefined> {
  if (!domain) return undefined
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.domain, domain))
    .limit(1)
  return row?.id
}

async function hydrate(c: Campaign): Promise<HydratedCampaign> {
  const row = await reconcileHeroImageStatus(c)
  const companyId = await companyIdForDomain(row.domain)
  const [products, videos] = await Promise.all([
    Promise.all(
      row.productIds.map((id) => getProductById(id, companyId)),
    ).then((ps) => ps.filter((p): p is ProductWithCategory => p !== null)),
    db
      .select()
      .from(campaignVideos)
      .where(eq(campaignVideos.campaignId, row.id))
      .orderBy(desc(campaignVideos.createdAt)),
  ])
  return {
    ...row,
    products,
    videos: videos.map(toPublicVideo),
    heroImageStale: isHeroImageStale(row),
  }
}

// ---------------------------------------------------------------------------
// Bundle image (hero) regeneration
// ---------------------------------------------------------------------------

/** Order-sensitive comparison — a reorder changes the layout, so it counts. */
function sameBundle(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/**
 * The image is stale when it was demonstrably rendered from a different bundle.
 * Campaigns created before provenance was tracked have an empty
 * `heroImageProductIds` — unknown, not stale, so we never nag about them.
 */
function isHeroImageStale(c: Campaign): boolean {
  if (!c.heroImageUrl || c.heroImageProductIds.length === 0) return false
  return !sameBundle(c.heroImageProductIds, c.productIds)
}

/** Campaign ids with a regeneration running in THIS process. */
const heroImageJobs = new Set<string>()
/** Campaign ids whose bundle changed again mid-render — one more pass is owed. */
const heroImageReruns = new Set<string>()

/**
 * A `pending` row with no live job and no recent activity was interrupted
 * (process restart) — flip it to failed so the UI stops waiting on it.
 */
async function reconcileHeroImageStatus(c: Campaign): Promise<Campaign> {
  if (c.heroImageStatus !== 'pending') return c
  if (heroImageJobs.has(c.id)) return c
  if (Date.now() - c.updatedAt.getTime() < HERO_IMAGE_STALE_MS) return c

  const [row] = await db
    .update(campaigns)
    .set({
      heroImageStatus: 'failed',
      heroImageError: 'Image generation was interrupted. Try again.',
    })
    .where(eq(campaigns.id, c.id))
    .returning()
  return row ?? c
}

/** Render the bundle image for a campaign and record the result. Never throws. */
async function runHeroImageJob(campaignId: string): Promise<void> {
  try {
    await db
      .update(campaigns)
      .set({ heroImageStatus: 'pending', heroImageError: null })
      .where(eq(campaigns.id, campaignId))

    const [row] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1)
    if (!row) return

    const companyId = await companyIdForDomain(row.domain)
    const products = (
      await Promise.all(row.productIds.map((id) => getProductById(id, companyId)))
    ).filter((p): p is ProductWithCategory => p !== null)

    // Nothing left to photograph — drop the image rather than fail.
    if (products.length === 0) {
      await db
        .update(campaigns)
        .set({
          heroImageUrl: null,
          heroImageProductIds: [],
          heroImageStatus: 'idle',
          heroImageError: null,
        })
        .where(eq(campaigns.id, campaignId))
      return
    }

    const url = await withTimeout(
      logoFromCompany(row.domain).then((brand) =>
        generateKitImage(products, brand),
      ),
      KIT_IMAGE_TIMEOUT_MS,
      'kit image',
    )

    // Snapshot the bundle we rendered so the next edit is detectable — and so a
    // bundle changed again mid-render is immediately reported as stale.
    await db
      .update(campaigns)
      .set({
        heroImageUrl: url,
        heroImageProductIds: row.productIds,
        heroImageStatus: 'ready',
        heroImageError: null,
      })
      .where(eq(campaigns.id, campaignId))
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Image generation failed.'
    console.warn('[campaigns] hero image regeneration failed:', message)
    // The previous `heroImageUrl` is deliberately left untouched.
    await db
      .update(campaigns)
      .set({ heroImageStatus: 'failed', heroImageError: message })
      .where(eq(campaigns.id, campaignId))
      .catch(() => undefined)
  }
}

/**
 * Kick off a background regeneration, at most one at a time per campaign. When
 * the bundle changes again while a render is in flight, a single extra pass is
 * queued so the image always settles on the final bundle.
 */
function startHeroImageJob(campaignId: string): void {
  if (heroImageJobs.has(campaignId)) {
    heroImageReruns.add(campaignId)
    return
  }
  heroImageJobs.add(campaignId)
  void (async () => {
    try {
      do {
        heroImageReruns.delete(campaignId)
        await runHeroImageJob(campaignId)
      } while (heroImageReruns.has(campaignId))
    } finally {
      heroImageJobs.delete(campaignId)
      heroImageReruns.delete(campaignId)
    }
  })()
}

/**
 * Manually (re)generate the bundle image. Returns the campaign in its pending
 * state — the client polls the detail endpoint for the result.
 */
export async function regenerateCampaignHeroImage(
  id: string,
): Promise<HydratedCampaign | null> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1)
  if (!row) return null

  if (heroImageJobs.has(id)) return hydrate(row)

  const [pending] = await db
    .update(campaigns)
    .set({ heroImageStatus: 'pending', heroImageError: null })
    .where(eq(campaigns.id, id))
    .returning()
  startHeroImageJob(id)
  return hydrate(pending ?? row)
}

export async function generateCampaign(
  brand: CampaignBrandInput,
  bundleSize = DEFAULT_BUNDLE_SIZE,
  brief?: string | null,
): Promise<HydratedCampaign> {
  const query = buildSemanticQuery(brand, brief)

  // Vector search may fail OR hang if embeddings are unavailable — a copy-only
  // draft is still valid, so bound it and continue with an empty bundle.
  const products = await withTimeout(
    searchProductsByText(query, bundleSize),
    SEARCH_TIMEOUT_MS,
    'semantic search',
  ).catch((err) => {
    console.warn(
      '[campaigns] semantic search failed, continuing with empty bundle:',
      err instanceof Error ? err.message : err,
    )
    return [] as ProductWithCategory[]
  })

  // generateCampaignCopy is imported lazily to keep the LLM dep out of hot paths.
  const { generateCampaignCopy, fallbackCampaignCopy } = await import(
    './generateCampaignCopy.js'
  )
  // Copy generation is best-effort: if the LLM is unreachable ("fetch failed")
  // we still create a valid draft with deterministic copy the user can edit.
  const copy = await withTimeout(
    generateCampaignCopy(brand, products.map((p) => p.name), brief),
    COPY_TIMEOUT_MS,
    'copy generation',
  ).catch((err) => {
    console.warn(
      '[campaigns] copy generation failed, using fallback copy:',
      err instanceof Error ? err.message : err,
    )
    return fallbackCampaignCopy(brand)
  })

  // The client posts the brand with the logo; fall back to the company's stored
  // extraction (the same source a later regeneration uses).
  const bundleBrand = products.length
    ? await logoFromBrandInput(brand)
        .then((logo) =>
          logo
            ? ({ logo, companyName: brand.companyName } satisfies BundleBrand)
            : logoFromCompany(brand.domain ?? null),
        )
        .catch(() => undefined)
    : undefined

  // Best-effort: a campaign without its kit image is still a useful draft, and
  // the user can regenerate it from the dashboard.
  const heroImageUrl = products.length
    ? await withTimeout(
        generateKitImage(products, bundleBrand),
        KIT_IMAGE_TIMEOUT_MS,
        'kit image',
      ).catch((err) => {
        console.warn(
          '[campaigns] kit image generation failed:',
          err instanceof Error ? err.message : err,
        )
        return null
      })
    : null

  const productIds = products.map((p) => p.id)
  const [row] = await db
    .insert(campaigns)
    .values({
      domain: brand.domain ?? null,
      title: copy.title,
      description: copy.description,
      status: 'draft',
      productIds,
      heroImageUrl,
      heroImageProductIds: heroImageUrl ? productIds : [],
      heroImageStatus: heroImageUrl ? 'ready' : 'idle',
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

/**
 * Save a campaign. When the save changes the bundle (add / remove / replace /
 * reorder), the composite bundle image is regenerated in the background so it
 * keeps matching its contents; text-only edits never trigger a generation.
 */
export async function updateCampaign(
  id: string,
  input: UpdateCampaignBody,
): Promise<HydratedCampaign | null> {
  const [current] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1)
  if (!current) return null

  const values: Record<string, unknown> = {}
  if (input.title !== undefined) values.title = input.title
  if (input.description !== undefined) values.description = input.description
  if (input.productIds !== undefined) values.productIds = input.productIds
  if (input.status !== undefined) values.status = input.status

  const bundleChanged =
    input.productIds !== undefined &&
    !sameBundle(input.productIds, current.productIds)
  // An empty bundle has nothing to photograph — clear the image instead.
  const regenerate = bundleChanged && input.productIds!.length > 0

  if (bundleChanged && input.productIds!.length === 0) {
    values.heroImageUrl = null
    values.heroImageProductIds = []
    values.heroImageStatus = 'idle'
    values.heroImageError = null
  } else if (regenerate) {
    values.heroImageStatus = 'pending'
    values.heroImageError = null
  }

  const [row] = await db
    .update(campaigns)
    .set(values)
    .where(eq(campaigns.id, id))
    .returning()
  if (!row) return null

  if (regenerate) startHeroImageJob(id)
  return hydrate(row)
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
