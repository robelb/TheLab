import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronUp,
  Gift,
  Loader2,
  Mail,
  Minus,
  Package,
  Plus,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Sticker,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePostHog } from '@posthog/react'
import { LOGO_FILE_ACCEPT, uploadLogoFile } from '@/api/uploads'
import { ProductImage } from '@/components/ProductImage'
import { ProductPickerDialog } from '@/components/ProductPickerDialog'
import { QuantityStepper } from '@/components/QuantityStepper'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useFunnel } from '@/context/FunnelContext'
import {
  useCampaign,
  useCampaignBrandSignals,
  useCreateCampaign,
  useGenerateCampaign,
  useRegenerateCampaignHeroImage,
} from '@/hooks/use-campaigns'
import { useBoxSupplies, useProductsByIds } from '@/hooks/use-products'
import { useProduct } from '@/hooks/use-product'
import {
  BOX_SKU_PREFIX,
  isCustomDesignSupply,
  sameComposition,
  toBoxLine,
} from '@/lib/box'
import { parseDesigns, type ProductDesign } from '@/lib/boxDraft'
import { apiErrorMessage as errorMessage } from '@/lib/notify'
import { MAX_LINE_QUANTITY, pickFee, unitPriceFor } from '@/lib/pricing'
import {
  BUILDER_STEPS,
  EMPTY_STEP_DRAFT,
  heroKeyFor,
  loadStepDraft,
  saveStepDraft,
  type BuilderStep,
  type StepDraft,
} from '@/lib/stepDraft'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/utils/format'
import {
  GREETING_MAX_LENGTH,
  type BoxDetails,
  type BoxLine,
  type StickerLogo,
} from '@/types/box'
import type { Product } from '@/types/product'

/** How many products the AI puts in a box when it picks for you. */
const AI_BOX_SIZE = 6

/**
 * The step-by-step box builder — the shop's and every collection's that
 * offers building a box.
 *
 * Products, then a greeting card, then the packaging, then optional logo
 * stickers, then a review with a photo of the box and its price. Each step
 * is one decision, and the price per box follows along at the bottom.
 *
 * Where customising is allowed (the shop, and collections that turn it on),
 * products and the box itself can be designed in the design editor from
 * inside their steps, "Eigenes Design" supplies are offered, and the AI can
 * pick the products from a short brief. Where it is not (Christmas), none of
 * that appears.
 */
/** Most products the box photo shows; matches the server's campaign cap. */
const PHOTO_MAX_PRODUCTS = 12

export function StepBoxBuilderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const posthog = usePostHog()
  const { domain } = useAuth()
  const { shopHome, inFunnel, collectionSlug, collectionTag, allowCustomization } =
    useFunnel()
  const canDesign = allowCustomization
  // The Christmas collection has its own wording; everywhere else is general.
  const christmas = collectionTag === 'christmas'
  const copy = (key: string) =>
    t(christmas ? `stepBuilder.christmas.${key}` : `stepBuilder.${key}`)
  const { items: cartItems, addItem, updateBoxItem, updateQuantity } = useCart()
  const [searchParams, setSearchParams] = useSearchParams()

  const [draft, setDraft] = useState<StepDraft>(() => {
    const saved = loadStepDraft()
    // A box half-built somewhere else — another collection, or the shop with
    // its whole catalogue and design tools — does not belong on this page.
    return saved.collectionSlug !== collectionSlug
      ? { ...EMPTY_STEP_DRAFT, collectionSlug }
      : saved
  })
  useEffect(() => saveStepDraft(draft), [draft])

  const update = useCallback(
    (patch: Partial<StepDraft>) => setDraft((d) => ({ ...d, ...patch })),
    [],
  )

  // ── Products ─────────────────────────────────────────────────────────────
  // Only ids are stored, so the box is read back from the API; the picker
  // hands over whole products, which are kept so an add shows at once.
  const [known, setKnown] = useState<Record<string, Product>>({})
  const { data: fetched, isLoading: productsLoading } = useProductsByIds(
    draft.productIds,
  )
  useEffect(() => {
    if (!fetched?.length) return
    setKnown((prev) => {
      const next = { ...prev }
      for (const p of fetched) next[p.id] = p
      return next
    })
  }, [fetched])
  const products = useMemo(
    () =>
      draft.productIds
        .map((id) => known[id])
        .filter((p): p is Product => Boolean(p)),
    [known, draft.productIds],
  )
  const quantityOf = (id: string) => draft.quantities[id] ?? 1
  const [pickerOpen, setPickerOpen] = useState(false)

  // ── Designs ──────────────────────────────────────────────────────────────
  // Made in the design editor, which writes them straight into the stored
  // draft; this page reads them back when it mounts again.
  const designOf = (id: string | null | undefined): ProductDesign | null =>
    (canDesign && id ? draft.designs[id] : null) ?? null
  /** What a product looks like in this box: its design, or the plain photo. */
  const imageOf = (p: Product) => designOf(p.id)?.image ?? p.image
  // Coming back from the editor resumes a box being edited from the cart: the
  // `editing` marker is what keeps it bound to its cart line (see below).
  const openDesigner = (id: string) => {
    const back = draft.editingItemId
      ? `/build-box?editing=${encodeURIComponent(draft.editingItemId)}`
      : '/build-box'
    navigate(`/design/${encodeURIComponent(id)}?return=${encodeURIComponent(back)}`)
  }

  // ── Let the AI pick (shop only) ──────────────────────────────────────────
  const [brief, setBrief] = useState('')
  const brandSignals = useCampaignBrandSignals()
  const generate = useGenerateCampaign()
  const [pickError, setPickError] = useState<string | null>(null)
  const pickForMe = async () => {
    setPickError(null)
    try {
      const created = await generate.mutateAsync({
        brand: brandSignals,
        bundleSize: AI_BOX_SIZE,
        brief: brief.trim() || undefined,
        tag: inFunnel ? (collectionTag ?? undefined) : undefined,
        plainUnlessDesigned: true,
      })
      setKnown((prev) => {
        const next = { ...prev }
        for (const p of created.products) next[p.id] = p
        return next
      })
      setDraft((d) => ({
        ...d,
        campaignId: created.id,
        productIds: created.productIds,
        quantities: {},
        heroKey: null,
      }))
      posthog?.capture('box generated', {
        campaign_id: created.id,
        product_count: created.productIds.length,
        has_brief: Boolean(brief.trim()),
        builder: 'steps',
        domain,
      })
    } catch (err) {
      setPickError(errorMessage(err, t('buildBox.assembleFailed')))
    }
  }

  const addProducts = (picked: Product[]) => {
    setKnown((prev) => {
      const next = { ...prev }
      for (const p of picked) next[p.id] = p
      return next
    })
    setDraft((d) => ({
      ...d,
      productIds: [
        ...d.productIds,
        ...picked.map((p) => p.id).filter((id) => !d.productIds.includes(id)),
      ],
    }))
    setPickerOpen(false)
    posthog?.capture('step builder products added', {
      count: picked.length,
      collection: collectionSlug,
    })
  }

  const removeProduct = (id: string) =>
    setDraft((d) => {
      const { [id]: _dropped, ...quantities } = d.quantities
      return { ...d, productIds: d.productIds.filter((p) => p !== id), quantities }
    })

  const setQuantity = (id: string, quantity: number) =>
    setDraft((d) => ({
      ...d,
      quantities: { ...d.quantities, [id]: Math.max(1, Math.min(99, quantity)) },
    }))

  // ── Supplies ─────────────────────────────────────────────────────────────
  const { supplies: allSupplies, isLoading: suppliesLoading } = useBoxSupplies()
  // "Eigenes Design" options are customising: a collection with customising
  // off offers ready-made ones only. A saved choice of one then reads as
  // unpicked, and the step asks again.
  const supplies = useMemo(() => {
    if (allowCustomization) return allSupplies
    const ready = (list: Product[]) => list.filter((p) => !isCustomDesignSupply(p))
    return {
      packaging: ready(allSupplies.packaging),
      filling: ready(allSupplies.filling),
      cards: ready(allSupplies.cards),
      stickers: ready(allSupplies.stickers),
    }
  }, [allSupplies, allowCustomization])
  const card = supplies.cards.find((p) => p.id === draft.cardId) ?? null
  const packaging = supplies.packaging.find((p) => p.id === draft.packagingId) ?? null
  const filling = supplies.filling.find((p) => p.id === draft.fillingId) ?? null
  const sticker = supplies.stickers.find((p) => p.id === draft.stickerId) ?? null

  // Every box is padded with filling, so one is always chosen: the cheapest
  // on offer until they pick another. A stale choice falls back the same way.
  // Not for a box opened from a ready-made one (or restored from the cart as
  // one): it keeps exactly what it was sold with — no filling if it had none —
  // or slipping one in would quietly cost it its set price.
  useEffect(() => {
    if (suppliesLoading) return
    setDraft((d) => {
      if (d.bundleId) return d
      const cheapest = supplies.filling.reduce<Product | null>(
        (best, p) => (!best || p.price < best.price ? p : best),
        null,
      )
      const fillingId = supplies.filling.some((p) => p.id === d.fillingId)
        ? d.fillingId
        : (cheapest?.id ?? null)
      return fillingId === d.fillingId ? d : { ...d, fillingId }
    })
  }, [supplies.filling, suppliesLoading])

  // ── Editing a box from the cart (`?edit=<cart line id>`) ──────────────────
  // Once restored, the URL carries `?editing=<cart line id>` instead, so a
  // reload or a trip to the design editor stays bound to that line. Opening
  // the builder any other way starts a new box: the line it was editing is
  // left alone, rather than overwritten by whatever is built next.
  const editParam = searchParams.get('edit')
  const editingParam = searchParams.get('editing')
  const bundleParam = searchParams.get('bundle')
  useEffect(() => {
    if (editParam || bundleParam) return
    setDraft((d) =>
      d.editingItemId && d.editingItemId !== editingParam
        ? { ...d, editingItemId: null }
        : d,
    )
  }, [editParam, editingParam, bundleParam])

  useEffect(() => {
    if (!editParam) return
    const item = cartItems.find((i) => i.product.id === editParam)
    const box = item?.box
    if (box) {
      const restored: StepDraft = {
        ...EMPTY_STEP_DRAFT,
        collectionSlug,
        step: 'review',
        productIds: box.lines.map((l) => l.productId),
        quantities: Object.fromEntries(box.lines.map((l) => [l.productId, l.quantity])),
        cardId: box.greetingCard?.productId ?? null,
        cardMessage: box.greetingCard?.message ?? '',
        packagingId: box.packaging?.productId ?? null,
        fillingId: box.filling?.productId ?? null,
        // A ready-made box taken as sold keeps its set price while it is
        // still that box — see `bundleIntact`.
        bundleId: box.bundleId ?? null,
        designs: parseDesigns(box.designs),
        stickerId: box.stickers?.productId ?? null,
        stickerLogo: box.stickerLogo ?? null,
        stickersDecided: true,
        boxes: item.quantity,
        campaignId: box.campaignId,
        editingItemId: item.product.id,
      }
      // The photo on the campaign was taken of exactly this box, so it counts
      // as current until something in it changes.
      setDraft({
        ...restored,
        heroKey: box.campaignId ? heroKeyFor(restored) : null,
      })
    }
    const editingId = box && item ? item.product.id : null
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('edit')
        if (editingId) next.set('editing', editingId)
        else next.delete('editing')
        return next
      },
      { replace: true },
    )
  }, [editParam, cartItems, collectionSlug, setSearchParams])

  // ── Opening a ready-made box (`?bundle=<product id>`) ─────────────────────
  // "Customise this box" on a ready-made one lands here with everything it
  // holds already chosen. Its own price holds until the contents change.
  const { data: bundle } = useProduct(bundleParam ?? draft.bundleId ?? undefined)
  useEffect(() => {
    if (!bundleParam || !bundle?.components?.length) return
    const of = (role: string) => bundle.components!.filter((c) => c.role === role)
    const contents = of('item')
    const sticker = of('sticker')[0]
    setDraft({
      ...EMPTY_STEP_DRAFT,
      collectionSlug,
      bundleId: bundle.id,
      productIds: contents.map((c) => c.product.id),
      quantities: Object.fromEntries(contents.map((c) => [c.product.id, c.quantity])),
      cardId: of('card')[0]?.product.id ?? null,
      packagingId: of('packaging')[0]?.product.id ?? null,
      fillingId: of('filling')[0]?.product.id ?? null,
      stickerId: sticker?.product.id ?? null,
      stickersDecided: true,
    })
    setKnown((prev) => {
      const next = { ...prev }
      for (const c of contents) next[c.product.id] = c.product
      return next
    })
    setSearchParams({}, { replace: true })
  }, [bundleParam, bundle, collectionSlug, setSearchParams])

  const editingItem = draft.editingItemId
    ? cartItems.find((i) => i.product.id === draft.editingItemId)
    : undefined

  // ── Steps ────────────────────────────────────────────────────────────────
  const stepIndex = BUILDER_STEPS.indexOf(draft.step)
  const stepDone: Record<BuilderStep, boolean> = {
    products: products.length > 0,
    card: Boolean(card),
    packaging: Boolean(packaging),
    stickers: draft.stickersDecided,
    review: false,
  }
  // A step can be opened once everything before it is done.
  const reachable = (step: BuilderStep) =>
    BUILDER_STEPS.slice(0, BUILDER_STEPS.indexOf(step)).every((s) => stepDone[s])
  const canContinue = draft.step === 'stickers' ? true : stepDone[draft.step]

  const topRef = useRef<HTMLDivElement>(null)
  const goTo = (step: BuilderStep) => {
    if (!reachable(step)) return
    update({ step })
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    posthog?.capture('step builder step viewed', { step, collection: collectionSlug })
  }
  const next = () => {
    if (draft.step === 'stickers' && !draft.stickersDecided) {
      update({ stickersDecided: true, stickerId: null })
    }
    const following = BUILDER_STEPS[stepIndex + 1]
    if (following) {
      setDraft((d) => ({ ...d, step: following }))
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      posthog?.capture('step builder step viewed', {
        step: following,
        collection: collectionSlug,
      })
    }
  }
  const back = () => {
    const previous = BUILDER_STEPS[stepIndex - 1]
    if (previous) goTo(previous)
  }

  // ── Price ────────────────────────────────────────────────────────────────
  // Volume tiers are picked by how many units the whole order needs: units
  // per box times boxes. The server prices the request the same way.
  const unitFor = (p: Product, perBox: number) =>
    unitPriceFor(p.price, p.graduatedPrices, perBox * draft.boxes)

  // A designed product carries its design on the line, and `customPrint`
  // stops the cart's catalogue refresh from swapping it back to stock.
  const productLines: BoxLine[] = products.map((p) => {
    const line = toBoxLine(p, quantityOf(p.id))
    const design = designOf(p.id)
    return design ? { ...line, customizedImage: design.image, customPrint: true } : line
  })
  const packagingDesign = designOf(packaging?.id)
  const productsTotal = products.reduce(
    (sum, p) => sum + unitFor(p, quantityOf(p.id)) * quantityOf(p.id),
    0,
  )
  const supplyParts = [card, packaging, filling, sticker].filter(
    (p): p is Product => Boolean(p),
  )
  const suppliesTotal = supplyParts.reduce((sum, p) => sum + unitFor(p, 1), 0)
  // A ready-made box keeps its own price while it is still that box — the
  // same check the server makes before honouring it.
  const bundleIntact = Boolean(
    draft.bundleId &&
      bundle?.id === draft.bundleId &&
      bundle.components &&
      sameComposition(
        [
          ...productLines,
          ...supplyParts.map((p) => ({ productId: p.id, quantity: 1 })),
        ],
        bundle.components,
      ),
  )
  const pieceCount = products.reduce((sum, p) => sum + quantityOf(p.id), 0)
  // Packing is part of the box's price, never a line of its own: every product
  // unit, the card and the sticker are picks — see `pickFee`. The server adds
  // the same. A ready-made box kept as sold has its own price instead.
  const packing = pickFee(pieceCount + (card ? 1 : 0) + (sticker ? 1 : 0))
  const perBox =
    bundleIntact && bundle
      ? unitPriceFor(bundle.price, bundle.graduatedPrices, draft.boxes)
      : productsTotal + suppliesTotal + packing
  const orderTotal = perBox * draft.boxes
  // The filling is chosen for them, so an empty box would already show its
  // price — a figure for nothing they picked. No price until there is a box.
  const hasPrice = pieceCount > 0 || bundleIntact

  // What the per-box price is made of, for the details under it. Packing is
  // its own row so the parts add up; a ready-made box is one price.
  const priceRows: { key: string; label: string; amount: number }[] = bundleIntact
    ? [{ key: 'bundle', label: t('stepBuilder.price.readyMade'), amount: perBox }]
    : [
        {
          key: 'products',
          label: `${t('stepBuilder.steps.products')} · ${t('common.item', { count: pieceCount })}`,
          amount: productsTotal,
        },
        ...(card ? [{ key: 'card', label: `${t('stepBuilder.steps.card')} · ${card.name}`, amount: unitFor(card, 1) }] : []),
        ...(packaging ? [{ key: 'packaging', label: `${t('stepBuilder.steps.packaging')} · ${packaging.name}`, amount: unitFor(packaging, 1) }] : []),
        ...(filling ? [{ key: 'filling', label: `${t('buildBox.fillingLabel')} · ${filling.name}`, amount: unitFor(filling, 1) }] : []),
        ...(sticker ? [{ key: 'sticker', label: `${t('stepBuilder.steps.stickers')} · ${sticker.name}`, amount: unitFor(sticker, 1) }] : []),
        ...(packing > 0 ? [{ key: 'packing', label: t('stepBuilder.price.packing'), amount: packing }] : []),
      ]
  const volumeApplied = bundleIntact
    ? Boolean(bundle && perBox !== bundle.price)
    : [...products.map((p) => [p, quantityOf(p.id)] as const), ...supplyParts.map((p) => [p, 1] as const)]
        .some(([p, n]) => unitFor(p, n) !== p.price)
  const [priceOpen, setPriceOpen] = useState(false)
  const currency = products[0]?.currency ?? packaging?.currency ?? 'EUR'

  // ── Box photo ────────────────────────────────────────────────────────────
  const { data: campaign, error: campaignError } = useCampaign(
    draft.campaignId ?? undefined,
  )
  const campaignId = campaignError ? null : draft.campaignId
  const create = useCreateCampaign()
  const regenerate = useRegenerateCampaignHeroImage()
  const heroKey = heroKeyFor(draft)
  const rendering =
    create.isPending ||
    regenerate.isPending ||
    campaign?.heroImageStatus === 'pending'
  const heroUrl =
    campaign?.heroImageUrl && draft.heroKey === heroKey ? campaign.heroImageUrl : null
  const [renderError, setRenderError] = useState<string | null>(null)
  // One automatic try per version of the box; after that it is the button.
  const triedKey = useRef<string | null>(null)

  const title = copy('boxTitle')

  const renderBox = useCallback(async () => {
    if (draft.productIds.length === 0) return
    setRenderError(null)
    const key = heroKeyFor(draft)
    // Every design rides along, so the photo shows the branded products and
    // the printed box; anything undesigned is photographed plain, as its tile
    // shows it.
    const productImages: Record<string, string> = {}
    for (const id of draft.productIds) {
      const design = canDesign ? draft.designs[id] : undefined
      if (design) productImages[id] = design.image
    }
    const boxDesign = canDesign && draft.packagingId ? draft.designs[draft.packagingId] : undefined
    // The photo is a preview: the image model takes about fourteen pictures,
    // so a very full box is photographed with its first dozen products.
    const photoIds = draft.productIds.slice(0, PHOTO_MAX_PRODUCTS)
    const supplyIds = {
      productIds: photoIds,
      ...(draft.packagingId ? { packagingId: draft.packagingId } : {}),
      ...(draft.fillingId ? { fillingId: draft.fillingId } : {}),
      ...(boxDesign ? { packagingImageUrl: boxDesign.image } : {}),
      ...(Object.keys(productImages).length > 0 ? { productImages } : {}),
      plainUnlessDesigned: true,
    }
    try {
      let id = campaignId
      if (!id) {
        const created = await create.mutateAsync({
          title,
          domain,
          productIds: photoIds,
        })
        id = created.id
        update({ campaignId: id })
      }
      await regenerate.mutateAsync({ id, supplies: supplyIds })
      update({ heroKey: key })
      posthog?.capture('step builder box photographed', {
        product_count: draft.productIds.length,
        collection: collectionSlug,
      })
    } catch (err) {
      setRenderError(errorMessage(err, t('stepBuilder.review.photoFailed')))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, campaignId, domain, title, canDesign])

  // The photo needs only the products and the packaging, so it starts as soon
  // as the packaging is chosen — the stickers step and the review then hide
  // most of the wait — unless one of this box already exists.
  const photoReady =
    draft.step === 'review' || (draft.step === 'stickers' && Boolean(draft.packagingId))
  useEffect(() => {
    if (!photoReady || rendering) return
    // A saved box's campaign is still loading: wait to see what it already has.
    if (draft.campaignId && !campaign && !campaignError) return
    if (draft.heroKey === heroKey && campaign?.heroImageUrl) return
    if (triedKey.current === heroKey) return
    triedKey.current = heroKey
    void renderBox()
  }, [
    photoReady,
    draft.heroKey,
    draft.campaignId,
    heroKey,
    rendering,
    campaign,
    campaignError,
    renderBox,
  ])

  const photoFailed =
    !rendering && (Boolean(renderError) || campaign?.heroImageStatus === 'failed')

  // ── Into the cart ────────────────────────────────────────────────────────
  const boxDetails = (): BoxDetails => ({
    campaignId,
    bundleId: bundleIntact ? draft.bundleId : null,
    bundlePrice: bundleIntact && bundle ? bundle.price : null,
    lines: productLines,
    packaging: packaging
      ? {
          ...toBoxLine(packaging, 1),
          customizedImage: packagingDesign?.image ?? null,
          customPrint: Boolean(packagingDesign),
        }
      : null,
    packagingPrompt: packagingDesign?.prompt ?? null,
    packagingLayout: packagingDesign?.layout ?? null,
    // Only the designs of what is actually in the box: one made for a product
    // since removed has nothing to be printed on.
    designs: Object.fromEntries(
      [...draft.productIds, packaging?.id]
        .map((id) => [id, designOf(id)] as const)
        .filter((entry): entry is [string, ProductDesign] => Boolean(entry[0] && entry[1])),
    ),
    filling: filling ? toBoxLine(filling, 1) : null,
    greetingCard: card
      ? { ...toBoxLine(card, 1), message: draft.cardMessage.trim() }
      : null,
    stickers: sticker ? toBoxLine(sticker, 1) : null,
    // No logo with stickers means it is sent after the request.
    stickerLogo: sticker ? draft.stickerLogo : null,
  })

  const boxProduct = (id: string): Product => ({
    id,
    sku: `${BOX_SKU_PREFIX}${id.slice(0, 8).toUpperCase()}`,
    name: title,
    tagline: t('buildBox.giftBoxTagline', { count: pieceCount }),
    price: Math.round(perBox * 100) / 100,
    currency,
    category: t('buildBox.giftBox'),
    image: heroUrl ?? packaging?.image ?? products[0]?.image ?? '',
    customizedImage: null,
    description: t('buildBox.giftBoxWith', {
      contents: productLines
        .map((l) => (l.quantity > 1 ? `${l.name} × ${l.quantity}` : l.name))
        .join(', '),
    }),
    details: [
      ...productLines.map((l) => `${l.name} × ${l.quantity}`),
      ...(card ? [`${t('stepBuilder.steps.card')}: ${card.name}`] : []),
      ...(packaging ? [`${t('stepBuilder.steps.packaging')}: ${packaging.name}`] : []),
      ...(filling ? [`${t('buildBox.fillingLabel')}: ${filling.name}`] : []),
      ...(sticker ? [`${t('stepBuilder.steps.stickers')}: ${sticker.name}`] : []),
    ],
  })

  const addToCart = () => {
    if (!stepDone.products || !stepDone.card || !stepDone.packaging) return
    const box = boxDetails()
    if (editingItem) {
      updateBoxItem(editingItem.product.id, boxProduct(editingItem.product.id), box)
      updateQuantity(editingItem.product.id, draft.boxes)
    } else {
      addItem(boxProduct(crypto.randomUUID()), draft.boxes, box)
    }
    posthog?.capture(editingItem ? 'box updated in cart' : 'box added to cart', {
      builder: 'steps',
      product_count: products.length,
      piece_count: pieceCount,
      boxes: draft.boxes,
      subtotal: orderTotal,
      collection: collectionSlug,
      has_message: Boolean(draft.cardMessage.trim()),
      has_stickers: Boolean(sticker),
      designed_count: Object.keys(boxDetails().designs ?? {}).length,
    })
    setDraft({ ...EMPTY_STEP_DRAFT, collectionSlug })
    navigate('/cart')
  }

  // A fresh box, not the cart line that was being edited: adding it must not
  // overwrite that line.
  const startOver = () => {
    setDraft({ ...EMPTY_STEP_DRAFT, collectionSlug })
    setRenderError(null)
    if (editingParam) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('editing')
          return next
        },
        { replace: true },
      )
    }
  }

  // ── Layout ───────────────────────────────────────────────────────────────
  return (
    <div ref={topRef} className="scroll-mt-24 space-y-6 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
          <Link to={shopHome}>
            <ArrowLeft className="size-4" />
            {inFunnel ? t('common.backToCollection') : t('buildBox.backToShop')}
          </Link>
        </Button>
        {(draft.productIds.length > 0 || draft.cardId) && (
          <Button variant="ghost" size="sm" onClick={startOver}>
            <RotateCcw className="size-4" />
            {t('buildBox.startOver')}
          </Button>
        )}
      </div>

      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {editingItem ? copy('editTitle') : copy('title')}
        </h1>
        <p className="max-w-2xl text-muted-foreground">{copy('intro')}</p>
      </header>

      <Stepper
        current={draft.step}
        done={stepDone}
        reachable={reachable}
        onSelect={goTo}
      />

      <section aria-live="polite" className="min-h-[40vh]">
        {draft.step === 'products' && (
          <ProductsStep
            products={products}
            loading={productsLoading && products.length === 0 && draft.productIds.length > 0}
            quantityOf={quantityOf}
            onQuantity={setQuantity}
            onRemove={removeProduct}
            onOpenPicker={() => setPickerOpen(true)}
            unitFor={unitFor}
            body={copy('products.body')}
            emptyHint={copy('products.emptyHint')}
            imageOf={imageOf}
            designed={(id) => Boolean(designOf(id))}
            onDesign={canDesign ? openDesigner : undefined}
            aiPick={
              canDesign ? (
                <AiPick
                  brief={brief}
                  onBrief={setBrief}
                  onPick={() => void pickForMe()}
                  picking={generate.isPending}
                  replaces={draft.productIds.length}
                  error={pickError}
                />
              ) : null
            }
          />
        )}

        {draft.step === 'card' && (
          <div className="space-y-6">
            <StepIntro
              icon={Mail}
              title={t('stepBuilder.card.title')}
              body={t('stepBuilder.card.body')}
            />
            <OptionGrid
              options={supplies.cards}
              loading={suppliesLoading}
              selectedId={draft.cardId}
              onSelect={(p) => update({ cardId: p.id })}
              size="md"
            />
            <div className="max-w-2xl space-y-2">
              <label htmlFor="card-message" className="text-sm font-medium">
                {t('stepBuilder.card.messageLabel')}
              </label>
              <Textarea
                id="card-message"
                rows={6}
                className="min-h-36"
                maxLength={GREETING_MAX_LENGTH}
                value={draft.cardMessage}
                onChange={(e) =>
                  update({ cardMessage: e.target.value.slice(0, GREETING_MAX_LENGTH) })
                }
                placeholder={t('stepBuilder.card.messagePlaceholder')}
              />
              <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span>{t('stepBuilder.card.messageHint')}</span>
                <span
                  className={cn(
                    'shrink-0 tabular-nums',
                    draft.cardMessage.length >= GREETING_MAX_LENGTH - 20 && 'text-primary',
                  )}
                  aria-live="polite"
                >
                  {draft.cardMessage.length}/{GREETING_MAX_LENGTH}
                </span>
              </div>
            </div>
          </div>
        )}

        {draft.step === 'packaging' && (
          <PackagingStep
            options={supplies.packaging}
            loading={suppliesLoading}
            selected={packaging}
            onSelect={(p) => update({ packagingId: p.id })}
            fillings={supplies.filling}
            filling={filling}
            fillingPrice={filling ? unitFor(filling, 1) : undefined}
            onFilling={(p) => update({ fillingId: p.id })}
            design={packagingDesign}
            onDesign={canDesign && packaging ? () => openDesigner(packaging.id) : undefined}
          />
        )}

        {draft.step === 'stickers' && (
          <div className="space-y-6">
            <StepIntro
              icon={Sticker}
              title={t('stepBuilder.stickers.title')}
              body={t('stepBuilder.stickers.body')}
              optional
            />
            <OptionGrid
              options={supplies.stickers}
              loading={suppliesLoading}
              selectedId={draft.stickersDecided ? draft.stickerId : null}
              onSelect={(p) => update({ stickerId: p.id, stickersDecided: true })}
              size="md"
              none={{
                label: t('stepBuilder.stickers.none'),
                selected: draft.stickersDecided && !draft.stickerId,
                onSelect: () => update({ stickerId: null, stickersDecided: true }),
              }}
            />
            {sticker && (
              <StickerLogoUpload
                logo={draft.stickerLogo}
                onChange={(stickerLogo) => update({ stickerLogo })}
              />
            )}
          </div>
        )}

        {draft.step === 'review' && (
          <ReviewStep
            heroUrl={heroUrl}
            rendering={rendering}
            photoFailed={photoFailed}
            photoError={renderError ?? campaign?.heroImageError ?? null}
            onRetry={() => void renderBox()}
            products={products}
            imageOf={imageOf}
            packagingImage={packagingDesign?.image ?? packaging?.image ?? null}
            photoAlt={copy('review.photoAlt')}
            quantityOf={quantityOf}
            unitFor={unitFor}
            card={card}
            stickerLogo={draft.stickerLogo}
            message={draft.cardMessage}
            packaging={packaging}
            filling={filling}
            sticker={sticker}
            perBox={perBox}
            boxes={draft.boxes}
            onBoxes={(action) =>
              setDraft((d) => {
                const boxes = typeof action === 'function' ? action(d.boxes) : action
                return {
                  ...d,
                  boxes: Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.floor(boxes) || 1)),
                }
              })
            }
            orderTotal={orderTotal}
            currency={currency}
            onEdit={goTo}
          />
        )}
      </section>

      {/* ── Running price and the way on ─────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background/95 backdrop-blur">
        {priceOpen && hasPrice && (
          <div
            id="price-details"
            className="mx-auto max-h-[50vh] max-w-7xl overflow-y-auto border-b border-border/40 px-4 py-3 sm:px-6 lg:px-8"
          >
            <ul className="space-y-1 text-sm sm:max-w-md">
              {priceRows.map((row) => (
                <li key={row.key} className="flex justify-between gap-4">
                  <span className="min-w-0 truncate text-muted-foreground">{row.label}</span>
                  <span className="shrink-0 tabular-nums">{formatPrice(row.amount, currency)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-4 border-t border-border/40 pt-1 font-medium">
                <span>{t('stepBuilder.price.perBox')}</span>
                <span className="tabular-nums">{formatPrice(perBox, currency)}</span>
              </li>
              {draft.boxes > 1 && (
                <li className="flex justify-between gap-4 font-medium">
                  <span>{t('stepBuilder.price.times', { count: draft.boxes })}</span>
                  <span className="tabular-nums">{formatPrice(orderTotal, currency)}</span>
                </li>
              )}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              {volumeApplied && `${t('stepBuilder.price.volume', { count: draft.boxes })} `}
              {t('stepBuilder.price.note')}
            </p>
          </div>
        )}
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {t('stepBuilder.footer.perBox')}
              {pieceCount > 0 && ` · ${t('common.item', { count: pieceCount })}`}
            </p>
            {hasPrice ? (
              <div className="flex flex-wrap items-baseline gap-x-3">
                <p className="font-display text-lg font-semibold tabular-nums">
                  {formatPrice(perBox, currency)}
                </p>
                <button
                  type="button"
                  onClick={() => setPriceOpen((o) => !o)}
                  aria-expanded={priceOpen}
                  aria-controls="price-details"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-2"
                >
                  {priceOpen ? t('stepBuilder.price.hide') : t('stepBuilder.price.show')}
                  <ChevronUp className={cn('size-3.5 transition-transform', !priceOpen && 'rotate-180')} />
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('stepBuilder.footer.noPriceYet')}</p>
            )}
            {draft.bundleId && (
              <p className="text-xs text-primary">
                {bundleIntact ? t('cart.bundleKept') : t('cart.bundleChanged')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button type="button" variant="outline" onClick={back}>
                <ArrowLeft className="size-4" />
                <span className="max-sm:sr-only">{t('stepBuilder.footer.back')}</span>
              </Button>
            )}
            {draft.step === 'review' ? (
              <Button
                type="button"
                size="lg"
                onClick={addToCart}
                disabled={!stepDone.products || !stepDone.card || !stepDone.packaging}
              >
                <ShoppingBag className="size-4" />
                {editingItem ? t('buildBox.saveToCart') : t('buildBox.addToCart')}
              </Button>
            ) : (
              <Button type="button" size="lg" onClick={next} disabled={!canContinue}>
                {draft.step === 'stickers' && !draft.stickersDecided
                  ? t('stepBuilder.footer.skip')
                  : t('stepBuilder.footer.next')}
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <ProductPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        // A collection offers its own range; the shop, the whole catalogue.
        tag={inFunnel ? collectionTag : undefined}
        existingIds={draft.productIds}
        onAdd={addProducts}
        title={copy('picker.title')}
        description={t('stepBuilder.picker.body')}
      />
    </div>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Stepper({
  current,
  done,
  reachable,
  onSelect,
}: {
  current: BuilderStep
  done: Record<BuilderStep, boolean>
  reachable: (step: BuilderStep) => boolean
  onSelect: (step: BuilderStep) => void
}) {
  const { t } = useTranslation()
  const index = BUILDER_STEPS.indexOf(current)
  return (
    <nav aria-label={t('stepBuilder.stepsLabel')}>
      <p className="mb-2 text-xs font-medium text-muted-foreground sm:hidden">
        {t('stepBuilder.stepOf', { step: index + 1, total: BUILDER_STEPS.length })} ·{' '}
        {t(`stepBuilder.steps.${current}`)}
      </p>
      <ol className="flex gap-1.5 sm:gap-2">
        {BUILDER_STEPS.map((step, i) => {
          const active = step === current
          const complete = done[step] && !active
          const open = reachable(step)
          return (
            <li key={step} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSelect(step)}
                disabled={!open}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex w-full flex-col gap-1.5 text-left disabled:cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-full rounded-full transition-colors',
                    active || complete || i < index ? 'bg-primary' : 'bg-border',
                  )}
                />
                <span
                  className={cn(
                    'hidden items-center gap-1 text-xs font-medium sm:flex',
                    active ? 'text-foreground' : open ? 'text-muted-foreground' : 'text-muted-foreground/60',
                  )}
                >
                  {complete && <Check className="size-3 text-primary" />}
                  {i + 1}. {t(`stepBuilder.steps.${step}`)}
                  {step === 'stickers' && (
                    <span className="font-normal">({t('stepBuilder.optional')})</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function StepIntro({
  icon: Icon,
  title,
  body,
  optional,
}: {
  icon: typeof Gift
  title: string
  body: string
  optional?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
        <Icon className="size-5 text-primary" />
        {title}
        {optional && (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-foreground/70">
            {t('stepBuilder.optional')}
          </span>
        )}
      </h2>
      <p className="max-w-2xl text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-2xl rounded-brand border border-border/40 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function ProductsStep({
  products,
  loading,
  quantityOf,
  onQuantity,
  onRemove,
  onOpenPicker,
  unitFor,
  body,
  emptyHint,
  imageOf,
  designed,
  onDesign,
  aiPick,
}: {
  products: Product[]
  loading: boolean
  quantityOf: (id: string) => number
  onQuantity: (id: string, quantity: number) => void
  onRemove: (id: string) => void
  onOpenPicker: () => void
  unitFor: (p: Product, perBox: number) => number
  body: string
  emptyHint: string
  imageOf: (p: Product) => string
  designed: (id: string) => boolean
  /** Opens the design editor; only where customising is allowed. */
  onDesign?: (id: string) => void
  aiPick: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <StepIntro icon={Gift} title={t('stepBuilder.products.title')} body={body} />
        {products.length > 0 && (
          <Button type="button" variant="outline" onClick={onOpenPicker}>
            <Plus className="size-4" />
            {t('stepBuilder.products.addMore')}
          </Button>
        )}
      </div>

      {aiPick}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-brand" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <button
          type="button"
          onClick={onOpenPicker}
          className="flex w-full flex-col items-center gap-3 rounded-brand border-2 border-dashed border-border/60 bg-muted/10 px-6 py-16 text-center transition-colors hover:border-primary/60 hover:bg-primary/5"
        >
          <Plus className="size-8 text-primary" />
          <span className="font-medium">{t('stepBuilder.products.empty')}</span>
          <span className="text-sm text-muted-foreground">{emptyHint}</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const quantity = quantityOf(p.id)
            return (
              <div
                key={p.id}
                className="group relative flex flex-col overflow-hidden rounded-brand border border-border/40 bg-card"
              >
                <button
                  type="button"
                  aria-label={t('buildBox.removeProduct', { name: p.name })}
                  onClick={() => onRemove(p.id)}
                  className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm hover:bg-destructive hover:text-white"
                >
                  <X className="size-4" />
                </button>
                <div className="relative aspect-square shrink-0 overflow-hidden bg-muted/10">
                  <ProductImage
                    src={imageOf(p)}
                    alt={p.name}
                    className="absolute inset-0 h-full w-full object-contain p-3"
                  />
                  {onDesign && (
                    <Button
                      type="button"
                      size="sm"
                      variant={designed(p.id) ? 'default' : 'secondary'}
                      onClick={() => onDesign(p.id)}
                      className="absolute bottom-2 left-2 h-7 px-2 text-xs shadow-sm"
                    >
                      <Wand2 className="size-3" />
                      {designed(p.id) ? t('buildBox.editDesign') : t('buildBox.design')}
                    </Button>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</p>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="text-sm tabular-nums">
                      {formatPrice(unitFor(p, quantity), p.currency)}
                    </span>
                    <div className="flex items-center rounded-brand border border-border/60">
                      <button
                        type="button"
                        aria-label={t('stepBuilder.products.less', { name: p.name })}
                        onClick={() => onQuantity(p.id, quantity - 1)}
                        disabled={quantity <= 1}
                        className="flex size-7 items-center justify-center disabled:opacity-40"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
                      <button
                        type="button"
                        aria-label={t('stepBuilder.products.more', { name: p.name })}
                        onClick={() => onQuantity(p.id, quantity + 1)}
                        className="flex size-7 items-center justify-center"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * One choice from a set of supplies, as large picture tiles — cards,
 * stickers. `none` adds a "without" tile for an optional step.
 */
function OptionGrid({
  options,
  loading,
  selectedId,
  onSelect,
  size,
  none,
}: {
  options: Product[]
  loading: boolean
  selectedId: string | null
  onSelect: (p: Product) => void
  size: 'md' | 'lg'
  none?: { label: string; selected: boolean; onSelect: () => void }
}) {
  const { t } = useTranslation()
  const grid =
    size === 'lg'
      ? 'grid-cols-2 sm:grid-cols-3'
      : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'

  if (loading) {
    return (
      <div className={cn('grid gap-4', grid)}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-brand" />
        ))}
      </div>
    )
  }
  if (options.length === 0 && !none) {
    return <Note>{t('stepBuilder.noOptions')}</Note>
  }

  return (
    <div role="radiogroup" className={cn('grid gap-4', grid)}>
      {none && (
        <button
          type="button"
          role="radio"
          aria-checked={none.selected}
          onClick={none.onSelect}
          className={cn(
            'flex aspect-square flex-col items-center justify-center gap-2 rounded-brand border-2 border-dashed p-4 text-center text-sm font-medium transition-colors',
            none.selected
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-border/60 text-muted-foreground hover:border-border',
          )}
        >
          <X className="size-6" />
          {none.label}
        </button>
      )}
      {options.map((option) => {
        const selected = option.id === selectedId
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(option)}
            className={cn(
              'relative flex flex-col overflow-hidden rounded-brand border bg-card text-left transition-colors',
              selected
                ? 'border-primary ring-2 ring-primary'
                : 'border-border/40 hover:border-border',
            )}
          >
            <div className="relative aspect-square shrink-0 overflow-hidden bg-muted/10">
              <ProductImage
                src={option.image}
                alt={option.name}
                className="absolute inset-0 h-full w-full object-contain p-2"
              />
              {selected && (
                <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3.5" />
                </span>
              )}
            </div>
            <div className="space-y-0.5 p-2.5">
              <p className="line-clamp-2 text-xs font-medium leading-snug">{option.name}</p>
              <p className="text-xs text-muted-foreground">
                {option.price > 0
                  ? formatPrice(option.price, option.currency)
                  : t('stepBuilder.included')}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function PackagingStep({
  options,
  loading,
  selected,
  onSelect,
  fillings,
  filling,
  fillingPrice,
  onFilling,
  design,
  onDesign,
}: {
  options: Product[]
  loading: boolean
  selected: Product | null
  onSelect: (p: Product) => void
  fillings: Product[]
  filling: Product | null
  /** What the filling costs per box at the current number of boxes. */
  fillingPrice?: number
  onFilling: (p: Product) => void
  /** The shopper's print on the chosen box, when they made one. */
  design: ProductDesign | null
  /** Opens the design editor on the chosen box; only where customising is allowed. */
  onDesign?: () => void
}) {
  const { t } = useTranslation()
  const preview = selected ?? options[0] ?? null
  // The print shows on the box it was made for, not on another one picked since.
  const previewImage = preview && selected && preview.id === selected.id && design
    ? design.image
    : preview?.image
  return (
    <div className="space-y-6">
      <StepIntro
        icon={Package}
        title={t('stepBuilder.packaging.title')}
        body={t('stepBuilder.packaging.body')}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        {/* The large preview: the box is what the recipient sees first. */}
        <div className="space-y-3 lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-brand border border-border/40 bg-muted/10">
            {loading || !preview ? (
              <Skeleton className="aspect-square w-full" />
            ) : (
              <ProductImage
                src={previewImage}
                alt={preview.name}
                className="aspect-square w-full object-contain p-6"
              />
            )}
          </div>
          {preview && (
            <div className="space-y-1">
              <p className="font-medium">{preview.name}</p>
              <p className="text-sm text-muted-foreground">
                {preview.price > 0
                  ? formatPrice(preview.price, preview.currency)
                  : t('stepBuilder.included')}
                {preview.tagline ? ` · ${preview.tagline}` : ''}
              </p>
              {!selected && (
                <p className="text-xs text-primary">{t('stepBuilder.packaging.pick')}</p>
              )}
              {selected && onDesign && (
                <div className="flex flex-wrap items-center gap-2 rounded-brand border border-border/40 bg-background/60 px-3 py-2">
                  <Wand2 className="size-4 shrink-0 text-primary" />
                  <p className="min-w-0 flex-1 text-xs text-foreground/70">
                    {design
                      ? t('stepBuilder.packaging.printed', {
                          prompt: design.prompt || t('buildBox.yourDesign'),
                        })
                      : t('stepBuilder.packaging.printHint')}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant={design ? 'ghost' : 'outline'}
                    onClick={onDesign}
                  >
                    {design ? t('buildBox.changeDesign') : t('buildBox.customiseBox')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <OptionGrid
            options={options}
            loading={loading}
            selectedId={selected?.id ?? null}
            onSelect={onSelect}
            size="lg"
          />
          {/* Every box is padded; the first filling is chosen for them and
              they can swap it for any other on offer. */}
          {fillings.length > 0 && (
            <div className="space-y-3 border-t border-border/40 pt-5">
              <div>
                <p className="font-medium">{t('stepBuilder.packaging.fillingTitle')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('stepBuilder.packaging.fillingBody')}
                </p>
              </div>
              <OptionGrid
                options={fillings}
                loading={false}
                selectedId={filling?.id ?? null}
                onSelect={onFilling}
                size="md"
              />
              {filling && (
                <p className="text-xs text-muted-foreground">
                  {filling.price > 0
                    ? t('stepBuilder.packaging.fillingPriced', {
                        name: filling.name,
                        price: formatPrice(fillingPrice ?? filling.price, filling.currency),
                      })
                    : t('stepBuilder.packaging.fillingIncluded', { name: filling.name })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewStep({
  heroUrl,
  rendering,
  photoFailed,
  photoError,
  onRetry,
  products,
  imageOf,
  packagingImage,
  photoAlt,
  quantityOf,
  unitFor,
  card,
  stickerLogo,
  message,
  packaging,
  filling,
  sticker,
  perBox,
  boxes,
  onBoxes,
  orderTotal,
  currency,
  onEdit,
}: {
  heroUrl: string | null
  rendering: boolean
  photoFailed: boolean
  photoError: string | null
  onRetry: () => void
  products: Product[]
  imageOf: (p: Product) => string
  packagingImage: string | null
  photoAlt: string
  quantityOf: (id: string) => number
  unitFor: (p: Product, perBox: number) => number
  card: Product | null
  stickerLogo: StickerLogo | null
  message: string
  packaging: Product | null
  filling: Product | null
  sticker: Product | null
  perBox: number
  boxes: number
  onBoxes: Dispatch<SetStateAction<number>>
  orderTotal: number
  currency: string
  onEdit: (step: BuilderStep) => void
}) {
  const { t } = useTranslation()
  const supplyRow = (
    step: BuilderStep,
    label: string,
    product: Product | null,
    fallback?: string,
  ) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm">{product?.name ?? fallback}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm tabular-nums">
          {product
            ? product.price > 0
              ? formatPrice(unitFor(product, 1), product.currency)
              : t('stepBuilder.included')
            : ''}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onEdit(step)}
        >
          {t('stepBuilder.review.change')}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      {/* ── The box ───────────────────────────────────────────────────── */}
      <div className="space-y-3 lg:sticky lg:top-24">
        <div
          className="relative overflow-hidden rounded-brand border border-border/40 bg-muted/10"
          aria-busy={rendering}
        >
          {heroUrl ? (
            <img
              src={heroUrl}
              alt={photoAlt}
              className={cn(
                'aspect-square w-full object-contain transition-opacity',
                rendering && 'opacity-40',
              )}
            />
          ) : (
            <Collage
              packagingImage={packagingImage}
              images={products.map((p) => ({ id: p.id, src: imageOf(p) }))}
            />
          )}
          {rendering && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/85 px-6 text-center">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm font-medium">{t('stepBuilder.review.photographing')}</p>
              <p className="text-xs text-foreground/70">{t('stepBuilder.review.takesAMinute')}</p>
            </div>
          )}
        </div>
        {photoFailed && (
          <div className="flex items-start justify-between gap-3 rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {photoError ?? t('stepBuilder.review.photoFailed')}
            </span>
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={onRetry}>
              {t('stepBuilder.review.retry')}
            </Button>
          </div>
        )}
        {!rendering && heroUrl && (
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            <Sparkles className="size-4" />
            {t('stepBuilder.review.rephotograph')}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{t('stepBuilder.review.photoNote')}</p>
      </div>

      {/* ── What is in it, and what it costs ───────────────────────────── */}
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-semibold">{t('stepBuilder.review.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('stepBuilder.review.body')}</p>
        </div>

        <div className="rounded-brand border border-border/40 bg-card/40 px-4 py-2">
          <div className="flex items-center justify-between py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('stepBuilder.steps.products')}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onEdit('products')}
            >
              {t('stepBuilder.review.change')}
            </Button>
          </div>
          <ul className="divide-y divide-border/40">
            {products.map((p) => {
              const quantity = quantityOf(p.id)
              return (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <ProductImage
                    src={imageOf(p)}
                    alt=""
                    className="size-10 shrink-0 rounded-brand border border-border/40 object-contain"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {quantity > 1 && <span className="tabular-nums">{quantity} × </span>}
                    {p.name}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatPrice(unitFor(p, quantity) * quantity, p.currency)}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="divide-y divide-border/40 border-t border-border/40">
            {supplyRow('card', t('stepBuilder.steps.card'), card)}
            {card && (
              <div className="py-2">
                <p className="text-xs text-muted-foreground">{t('stepBuilder.review.message')}</p>
                <p className="whitespace-pre-line text-sm">
                  {message.trim() || (
                    <span className="text-muted-foreground">{t('stepBuilder.review.noMessage')}</span>
                  )}
                </p>
              </div>
            )}
            {supplyRow('packaging', t('stepBuilder.steps.packaging'), packaging)}
            {filling && supplyRow('packaging', t('buildBox.fillingLabel'), filling)}
            {supplyRow(
              'stickers',
              t('stepBuilder.steps.stickers'),
              sticker,
              t('stepBuilder.stickers.none'),
            )}
            {sticker && (
              <div className="py-2">
                <p className="text-xs text-muted-foreground">{t('stepBuilder.stickers.logoTitle')}</p>
                <p className="truncate text-sm">
                  {stickerLogo ? (
                    stickerLogo.name ?? t('stepBuilder.stickers.logoUploaded')
                  ) : (
                    <span className="text-foreground/70">{t('stepBuilder.stickers.logoFollows')}</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-brand border border-border/40 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{t('stepBuilder.footer.perBox')}</span>
            <span className="text-sm tabular-nums">{formatPrice(perBox, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="box-count" className="text-sm font-medium">
              {t('stepBuilder.review.boxes')}
            </label>
            {/* Typed into as well as stepped; clearing the field to type a
                new number no longer snaps it back to one. */}
            <QuantityStepper
              id="box-count"
              value={boxes}
              onChange={onBoxes}
              min={1}
              max={MAX_LINE_QUANTITY}
            />
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-border/40 pt-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('stepBuilder.review.total')}
              </p>
              <p className="text-xs text-muted-foreground">{t('stepBuilder.review.totalNote')}</p>
            </div>
            <p className="font-display text-2xl font-semibold tabular-nums">
              {formatPrice(orderTotal, currency)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The logo for the stickers: upload it now, or leave it and send it after the
 * request. The file is stored as it is — a vector PDF or SVG prints far better
 * than anything converted for the screen.
 */
function StickerLogoUpload({
  logo,
  onChange,
}: {
  logo: StickerLogo | null
  onChange: (logo: StickerLogo | null) => void
}) {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const previewable = logo && /\.(png|jpe?g|webp|svg)(\?|$)/i.test(logo.url)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.size > 10 * 1024 * 1024) {
      setError(t('stepBuilder.stickers.tooLarge'))
      return
    }
    setUploading(true)
    try {
      const url = await uploadLogoFile(file)
      onChange({ url, name: file.name })
    } catch (err) {
      setError(errorMessage(err, t('stepBuilder.stickers.uploadFailed')))
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="max-w-2xl space-y-3 rounded-brand border border-border/40 bg-card/40 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t('stepBuilder.stickers.logoTitle')}</p>
        <p className="text-sm text-foreground/70">{t('stepBuilder.stickers.logoBody')}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept={LOGO_FILE_ACCEPT}
        className="sr-only"
        aria-label={t('stepBuilder.stickers.upload')}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {logo ? (
        <div className="flex flex-wrap items-center gap-3 rounded-brand border border-primary/40 bg-primary/5 p-3">
          {previewable ? (
            <img
              src={logo.url}
              alt=""
              className="size-12 shrink-0 rounded-brand border border-border/40 bg-background object-contain p-1"
            />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-brand border border-border/40 bg-background">
              <Check className="size-5 text-primary" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{logo.name ?? t('stepBuilder.stickers.logoUploaded')}</p>
            <p className="text-xs text-foreground/70">{t('stepBuilder.stickers.logoUploaded')}</p>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => input.current?.click()}
            >
              {t('stepBuilder.stickers.replace')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              {t('stepBuilder.stickers.remove')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => input.current?.click()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {uploading ? t('stepBuilder.stickers.uploading') : t('stepBuilder.stickers.upload')}
          </Button>
          <span className="text-xs text-foreground/70">{t('stepBuilder.stickers.formats')}</span>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!logo && (
        <p className="text-xs text-foreground/70">{t('stepBuilder.stickers.later')}</p>
      )}
    </div>
  )
}

/**
 * "Let us pick for you": the AI fills the box from a short brief and the
 * company's brand. Replaces whatever is in the box, and says so first.
 */
function AiPick({
  brief,
  onBrief,
  onPick,
  picking,
  replaces,
  error,
}: {
  brief: string
  onBrief: (brief: string) => void
  onPick: () => void
  picking: boolean
  replaces: number
  error: string | null
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 rounded-brand border border-border/40 bg-card/40 p-4">
      <label htmlFor="box-brief" className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="size-4 text-primary" />
        {t('buildBox.letUsPick')}
      </label>
      <Textarea
        id="box-brief"
        rows={2}
        value={brief}
        onChange={(e) => onBrief(e.target.value)}
        placeholder={t('buildBox.briefPlaceholder')}
        disabled={picking}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant="outline" onClick={onPick} disabled={picking}>
          {picking ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {picking ? t('buildBox.assembling') : t('buildBox.pickForMe')}
        </Button>
        {replaces > 0 && !picking && (
          <span className="text-xs text-foreground/70">
            {t('buildBox.replacesProducts', { count: replaces })}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/** What the box will hold, laid out while (or instead of) its photo. */
function Collage({
  packagingImage,
  images,
}: {
  packagingImage: string | null
  images: { id: string; src: string }[]
}) {
  return (
    <div className="relative aspect-square w-full">
      {packagingImage && (
        <ProductImage
          src={packagingImage}
          alt=""
          className="absolute inset-0 h-full w-full object-contain p-6 opacity-40"
        />
      )}
      <div className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-3 p-10">
        {images.slice(0, 8).map((p) => (
          <ProductImage
            key={p.id}
            src={p.src}
            alt=""
            className="size-20 rounded-brand border border-border/40 bg-background object-contain p-1 shadow-sm sm:size-24"
          />
        ))}
      </div>
    </div>
  )
}
