import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, rawSql } from '../../db/index.js'
import {
  campaignVideos,
  campaigns,
  companies,
  type Campaign,
  type CampaignOwnerKind,
  type CampaignVideo,
} from '../../db/schema/index.js'
import { embedText } from '../../services/embedding.js'
import {
  getBrandImageAssetsFromExtraction,
  hasAnyBrandImage,
  normalizeBrandImageUrls,
} from '../../customizer/brandAssets.js'
import { describeBrandMark } from '../../customizer/brandMarkFacts.js'
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
import {
  buildCampaignKitImagePrompt,
  isCompositionOnly,
  buildKitTemplateVars,
} from '../../systemInstruction/campaign.js'
import { resolveInstruction } from '../system-instructions/system-instructions.service.js'
import { saveRenderedImage } from '../uploads/uploads.service.js'
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
 * The logo to brand a bundle with. The caller's live brand wins — it's the logo
 * the shop is themed with right now, and it's the only source available for a
 * campaign with no domain. The company's stored extraction is the fallback.
 */
async function resolveBundleBrand(
  brand: CampaignBrandInput | undefined,
  domain: string | null,
): Promise<BundleBrand | undefined> {
  if (brand) {
    const logo = await logoFromBrandInput(brand).catch(() => undefined)
    if (logo) return { logo, companyName: brand.companyName }
  }
  return logoFromCompany(domain ?? brand?.domain ?? null)
}

/**
 * Composite "kit" image: the whole bundle laid out in one open gift box, with
 * the company logo branded onto every product — see `buildCampaignKitImagePrompt`.
 *
 * Throws with a user-facing message when it can't produce an image, so the
 * caller can either surface the reason (manual regeneration) or swallow it
 * (campaign assembly, where copy + bundle are still useful on their own).
 */
/**
 * The box and filling the shopper picked, resolved to products with reference
 * images. Render-time only — a campaign doesn't store them, so a dashboard
 * regeneration simply falls back to the default kraft box.
 */
export interface KitSupplySelection {
  packagingId?: string
  fillingId?: string
  /** The shopper's printed-box design, preferred over the catalog photo. */
  packagingImageUrl?: string
  /** Per-product designs, keyed by product id, preferred over catalog photos. */
  productImages?: Record<string, string>
  /**
   * Photograph anything the shopper has not designed from its PLAIN catalogue
   * photo, ignoring the company's own branded shot of it.
   *
   * Set by the box builder, and the reason is what the builder puts on screen.
   * Its product tiles deliberately show the plain photo — a tile wearing a logo
   * reads as designed — so the shopper picks two unbranded items, presses
   * build, and gets back a box whose contents are branded. The logo in that
   * render came from `customizedImage`, the shot onboarding made for the
   * company, and no amount of prompt work removes it: it is baked into the
   * reference the model was handed. The picture simply has to be built from the
   * same image the shopper was looking at.
   *
   * Not set by the dashboard's campaign builder, where the branded shot IS the
   * product's picture and the storefront shows it that way too.
   */
  plainUnlessDesigned?: boolean
}

interface ResolvedSupply {
  name: string
  description?: string | null
  image: FetchedImage
}

/** Load one supply and its reference image; null if either is unavailable. */
async function resolveSupply(
  id: string | undefined,
  imageOverride?: string,
  plainUnlessDesigned = false,
): Promise<ResolvedSupply | null> {
  if (!id) return null
  try {
    const product = await getProductById(id)
    if (!product) return null
    const image = await fetchImage(
      imageOverride ??
        (plainUnlessDesigned ? product.image : product.customizedImage ?? product.image),
      'product',
    )
    return { name: product.name, description: product.description, image }
  } catch (err) {
    // A supply we can't load just drops us back to the house-style scene.
    console.warn(
      '[campaigns] could not load supply for the kit image:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

async function generateKitImage(
  products: ProductWithCategory[],
  brand?: BundleBrand,
  supplies?: KitSupplySelection,
): Promise<string> {
  const config = resolveImageLlmConfig()
  if (!config) throw new Error(missingImageLlmConfigMessage())
  if (products.length === 0) {
    throw new Error('Add at least one product to the bundle first.')
  }

  /**
   * Which photograph of a product the render is built from.
   *
   * A design the shopper made always wins. What stands in behind it is the
   * question: the company's own branded shot, so the group photo agrees with a
   * storefront that shows branded tiles — or the plain catalogue photo, so it
   * agrees with a builder that shows plain ones. Both are "agreeing with the
   * products"; they just disagree about which products the shopper is looking
   * at. The caller knows, and says — see `plainUnlessDesigned`.
   */
  const sourceFor = (p: ProductWithCategory) =>
    supplies?.productImages?.[p.id] ??
    (supplies?.plainUnlessDesigned ? p.image : p.customizedImage ?? p.image)
  const fetched = await Promise.allSettled(
    products.map((p) => fetchImage(sourceFor(p), 'product')),
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

  const [packaging, filling] = await Promise.all([
    resolveSupply(
      supplies?.packagingId,
      supplies?.packagingImageUrl,
      supplies?.plainUnlessDesigned,
    ),
    resolveSupply(supplies?.fillingId, undefined, supplies?.plainUnlessDesigned),
  ])

  const kitNames = usable.map((e) => e.product.name)

  // A product whose reference is a design the shopper made, or a shot the
  // company already branded, arrives with the logo on it. Telling the model to
  // brand it again is telling it to move a mark somebody placed by hand.
  const preBranded = usable
    .filter((e) => sourceFor(e.product) !== e.product.image)
    .map((e) => e.product.name)

  /**
   * Brand nothing the shopper did not brand themselves.
   *
   * The prompt cannot decide this for itself: an empty `preBranded` list is
   * equally the shape of a kit somebody wants branded from scratch, which is
   * what the dashboard's campaign builder asks for. So it hangs off the same
   * flag as the source images, because it is the same intent — show what the
   * shopper made, and nothing else. A caller that wants plain products
   * photographed plain does not want a logo invented onto them either.
   *
   * Before this, the box builder got one anyway: a logo on every item, placed
   * and sized by the model. It read as a design the shopper had made, and the
   * ones who then opened the editor found a blank canvas that disagreed with
   * the picture they were looking at.
   *
   * Passed as the raw intent rather than pre-narrowed to "and nothing is
   * branded yet". Qualified that way it went quiet on the mixed box — design
   * one product of three and the other two came back branded too, because a
   * part-designed box fell through to the photoshoot. `kitBrandingMode` is
   * where that split belongs; it can see both the intent and the list.
   */
  const noBranding = Boolean(supplies?.plainUnlessDesigned)

  // Two ways there is nothing to apply: every product already carries its
  // branding, or none of them does and none is meant to. Either way the logo
  // reference stops being useful and starts being dangerous: handed a logo, the
  // model treats branding as part of the job and either re-renders marks the
  // customer placed by hand or invents marks they never asked for. Not
  // attaching it is what makes the prompt's contract stick — asking nicely is
  // not.
  const compositionOnly = isCompositionOnly(kitNames, preBranded, noBranding)
  const useLogo = brand && !compositionOnly

  // Order is the contract the prompt describes by position: products first
  // (the first image is the edit base), then the box, the filling, logo last.
  const images = usable.map((e) => e.result.value)
  if (packaging) images.push(packaging.image)
  if (filling) images.push(filling.image)
  if (useLogo) images.push(brand.logo)

  // Measured logo facts let the prompt pin layout + colours as ground truth.
  const logoFacts = useLogo ? await describeBrandMark(brand.logo) : null
  const kitOptions = {
    hasLogo: Boolean(useLogo),
    preBranded,
    noBranding,
    companyName: brand?.companyName,
    logoFacts,
    packaging: packaging
      ? { name: packaging.name, description: packaging.description }
      : null,
    filling: filling ? { name: filling.name } : null,
  }
  // Super-admin override (system_instructions table) wins; the built-in
  // builder is the default and the fallback on any override failure.
  const override = await resolveInstruction(
    'campaign-kit-image',
    buildKitTemplateVars(kitNames, kitOptions),
  )
  const prompt = override ?? buildCampaignKitImagePrompt(kitNames, kitOptions)
  const buffer = await generateProductPhoto(prompt, images, config, {
    size: '1024x1024',
    // The kit shot is specified as a square flat-lay throughout the brief.
    aspectRatio: '1:1',
  })
  return saveRenderedImage(buffer.toString('base64'), { prefix: 'campaign' })
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
/** Caller-supplied brand for an in-flight job, so a rerun keeps the logo. */
const heroImageBrands = new Map<string, CampaignBrandInput>()
/** Same, for the chosen box and filling — a rerun must not lose them. */
const heroImageSupplies = new Map<string, KitSupplySelection>()

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
async function runHeroImageJob(
  campaignId: string,
  brand?: CampaignBrandInput,
  supplies?: KitSupplySelection,
): Promise<void> {
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

    // A campaign with no domain of its own still belongs to whoever is asking —
    // fall back to their brand's domain so the products come back with that
    // company's branded shots rather than the plain catalog images.
    const companyId = await companyIdForDomain(row.domain ?? brand?.domain ?? null)
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
      resolveBundleBrand(brand, row.domain).then((bundleBrand) =>
        generateKitImage(products, bundleBrand, supplies),
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
function startHeroImageJob(
  campaignId: string,
  brand?: CampaignBrandInput,
  supplies?: KitSupplySelection,
): void {
  if (brand) heroImageBrands.set(campaignId, brand)
  if (supplies) heroImageSupplies.set(campaignId, supplies)
  if (heroImageJobs.has(campaignId)) {
    heroImageReruns.add(campaignId)
    return
  }
  heroImageJobs.add(campaignId)
  void (async () => {
    try {
      do {
        heroImageReruns.delete(campaignId)
        await runHeroImageJob(
          campaignId,
          heroImageBrands.get(campaignId),
          heroImageSupplies.get(campaignId),
        )
      } while (heroImageReruns.has(campaignId))
    } finally {
      heroImageJobs.delete(campaignId)
      heroImageReruns.delete(campaignId)
      heroImageBrands.delete(campaignId)
      heroImageSupplies.delete(campaignId)
    }
  })()
}

/**
 * Manually (re)generate the bundle image. Returns the campaign in its pending
 * state — the client polls the detail endpoint for the result.
 */
export async function regenerateCampaignHeroImage(
  id: string,
  brand?: CampaignBrandInput,
  supplies?: KitSupplySelection,
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
  startHeroImageJob(id, brand, supplies)
  return hydrate(pending ?? row)
}

export async function generateCampaign(
  brand: CampaignBrandInput,
  bundleSize = DEFAULT_BUNDLE_SIZE,
  brief?: string | null,
  plainUnlessDesigned = false,
  guestSessionId?: string | null,
  tag?: string,
): Promise<HydratedCampaign> {
  const query = buildSemanticQuery(brand, brief)

  // Vector search may fail OR hang if embeddings are unavailable — a copy-only
  // draft is still valid, so bound it and continue with an empty bundle.
  const products = await withTimeout(
    searchProductsByText(query, bundleSize, { tag }),
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
    ? await resolveBundleBrand(brand, brand.domain ?? null)
    : undefined

  // Best-effort: a campaign without its kit image is still a useful draft, and
  // the user can regenerate it from the dashboard.
  const heroImageUrl = products.length
    ? await withTimeout(
        generateKitImage(products, bundleBrand, { plainUnlessDesigned }),
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
      ownerKind: ownerKindFor({ domain: brand.domain, guestSessionId }),
      guestSessionId: guestSessionId ?? null,
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

/**
 * Who a new campaign belongs to.
 *
 * A domain means a company. No domain but a guest session means somebody
 * building a box without an account — and crucially not a house preset, which
 * is what "no domain" used to imply all by itself.
 */
export function ownerKindFor(params: {
  domain?: string | null
  guestSessionId?: string | null
}): CampaignOwnerKind {
  if (params.domain) return 'company'
  return params.guestSessionId ? 'guest' : 'preset'
}

/** Manually create a blank/draft campaign (no AI assembly). */
export async function createCampaign(
  input: CreateCampaignBody,
  owner: { guestSessionId?: string | null } = {},
): Promise<HydratedCampaign> {
  const [row] = await db
    .insert(campaigns)
    .values({
      domain: input.domain ?? null,
      ownerKind: ownerKindFor({
        domain: input.domain,
        guestSessionId: owner.guestSessionId,
      }),
      guestSessionId: owner.guestSessionId ?? null,
      title: input.title,
      description: input.description ?? '',
      status: 'draft',
      productIds: input.productIds ?? [],
      heroImageUrl: null,
    })
    .returning()
  return hydrate(row)
}

/**
 * Campaigns for a company, or the house presets when no domain is given.
 *
 * The preset list is explicitly `owner_kind = 'preset'`: guests' drafts also
 * have no domain, and without this every box a signed-out visitor started would
 * appear on the dashboard as a house preset.
 */
export async function listCampaigns(domain?: string): Promise<HydratedCampaign[]> {
  const where = domain
    ? eq(campaigns.domain, domain)
    : and(isNull(campaigns.domain), eq(campaigns.ownerKind, 'preset'))
  const rows = await db
    .select()
    .from(campaigns)
    .where(where)
    .orderBy(desc(campaigns.updatedAt))
  return Promise.all(rows.map(hydrate))
}

/** Just enough of a campaign to decide who may change it. */
export async function campaignOwner(id: string): Promise<{
  ownerKind: CampaignOwnerKind
  guestSessionId: string | null
  domain: string | null
} | null> {
  const [row] = await db
    .select({
      ownerKind: campaigns.ownerKind,
      guestSessionId: campaigns.guestSessionId,
      domain: campaigns.domain,
    })
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1)
  return row ?? null
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

  // `input.brand` and `input.supplies` are render hints only — deliberately
  // not in `values`.
  if (regenerate) startHeroImageJob(id, input.brand, input.supplies)
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
      : "c.domain IS NULL AND c.owner_kind = 'preset'",
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
