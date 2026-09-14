import {
  AlertTriangle,
  ArrowLeft,
  Gift,
  Image as ImageIcon,
  Loader2,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { usePostHog } from '@posthog/react'
import { AddProductDialog } from '@/components/AddProductDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CampaignProductTile } from '@/components/CampaignProductTile'
import { SupplyPicker } from '@/components/SupplyPicker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/context/AuthContext'
import { useBrand } from '@/context/BrandContext'
import { useCart } from '@/context/CartContext'
import {
  useCampaign,
  useCampaignBrandSignals,
  useCreateCampaign,
  useGenerateCampaign,
  useRegenerateCampaignHeroImage,
  useUpdateCampaign,
} from '@/hooks/use-campaigns'
import { useBoxSupplies, useProductsByIds } from '@/hooks/use-products'
import { useProduct } from '@/hooks/use-product'
import {
  BOX_SKU_PREFIX,
  boxAllLines,
  boxSubtotal,
  sameBoxLines,
  sameComposition,
  toBoxLine,
} from '@/lib/box'
import {
  designFor,
  EMPTY_BOX_DRAFT,
  loadBoxDraft,
  parseDesign,
  saveBoxDraft,
  supplySignature,
  type BoxDraft,
  type ProductDesign,
} from '@/lib/boxDraft'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/utils/format'
import type { BoxDetails, BoxLine } from '@/types/box'
import type { Product } from '@/types/product'

/** How many products the AI puts in a box when it picks for you. */
const AI_BOX_SIZE = 6

/**
 * The designs inside a box that is already in the cart.
 *
 * Boxes saved before per-product designs existed carry only the printed box, on
 * the packaging line — so fall back to reconstructing that one rather than
 * dropping a design somebody paid a render for.
 */
function designsFromBox(box: BoxDetails): Record<string, ProductDesign> {
  const out: Record<string, ProductDesign> = {}
  for (const [id, raw] of Object.entries(box.designs ?? {})) {
    const design = parseDesign(raw)
    if (design) out[id] = design
  }

  const packaging = box.packaging
  if (packaging?.customPrint && packaging.customizedImage && !out[packaging.productId]) {
    out[packaging.productId] = {
      image: packaging.customizedImage,
      prompt: box.packagingPrompt ?? null,
      layout: box.packagingLayout ?? null,
    }
  }
  return out
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response
      ?.data
    if (data?.error) return data.error
  }
  return err instanceof Error ? err.message : fallback
}

export function BuildBoxPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const posthog = usePostHog()
  const { brand } = useBrand()
  const { domain } = useAuth()
  const { items: cartItems, addItem, updateBoxItem } = useCart()
  const [searchParams, setSearchParams] = useSearchParams()

  const [draft, setDraft] = useState<BoxDraft>(loadBoxDraft)
  const [brief, setBrief] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    saveBoxDraft(draft)
  }, [draft])

  // Only ids are persisted, so the box is rehydrated from the API on load. The
  // picker hands us whole products though, so they're cached here as well —
  // otherwise every add would change the query key and blank the grid while the
  // refetch runs.
  const [known, setKnown] = useState<Record<string, Product>>({})
  const { data: fetched, isLoading: productsLoading } = useProductsByIds(
    draft.productIds,
  )

  useEffect(() => {
    if (!fetched?.length) return
    setKnown((prev) => {
      const next = { ...prev }
      let changed = false
      for (const p of fetched) {
        if (next[p.id] !== p) {
          next[p.id] = p
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [fetched])

  // `by-ids` doesn't preserve the requested order, but the bundle image layout
  // does — so re-order to match the box as the shopper arranged it.
  const products = useMemo(
    () =>
      draft.productIds
        .map((id) => known[id])
        .filter((p): p is Product => Boolean(p)),
    [known, draft.productIds],
  )

  // ── Packaging & filling ─────────────────────────────────────────────────
  // Every box ships in one and is padded with the other, so both are always
  // part of the price. The cheapest of each is preselected (the API returns
  // them price-ascending) and the shopper trades up from there.
  const { supplies, isLoading: suppliesLoading } = useBoxSupplies()

  const packaging =
    supplies.packaging.find((p) => p.id === draft.packagingId) ?? null
  const filling = supplies.filling.find((p) => p.id === draft.fillingId) ?? null

  useEffect(() => {
    if (suppliesLoading) return
    setDraft((d) => {
      // Also re-defaults when a saved choice no longer exists in the catalog.
      const packagingId = supplies.packaging.some((p) => p.id === d.packagingId)
        ? d.packagingId
        : (supplies.packaging[0]?.id ?? null)
      const fillingId = supplies.filling.some((p) => p.id === d.fillingId)
        ? d.fillingId
        : (supplies.filling[0]?.id ?? null)
      if (packagingId === d.packagingId && fillingId === d.fillingId) return d
      return { ...d, packagingId, fillingId }
    })
  }, [supplies, suppliesLoading])

  const quantityOf = useCallback(
    (id: string) => draft.quantities[id] ?? 1,
    [draft.quantities],
  )

  const setQuantity = (id: string, quantity: number) =>
    setDraft((d) => ({
      ...d,
      quantities: { ...d.quantities, [id]: Math.max(1, quantity) },
    }))

  // ── Editing a box that's already in the cart ─────────────────────────────
  // The cart links here as `/build-box?edit=<cart line id>`; the line carries a
  // full snapshot of the box, so it can be loaded back into the builder without
  // a round-trip. The param is dropped straight away so a later refresh doesn't
  // throw away edits made since.
  const editParam = searchParams.get('edit')

  useEffect(() => {
    if (!editParam) return
    const item = cartItems.find((i) => i.product.id === editParam)
    if (item?.box) {
      setDraft({
        campaignId: item.box.campaignId,
        bundleId: item.box.bundleId ?? null,
        title: item.product.name,
        productIds: item.box.lines.map((l) => l.productId),
        quantities: Object.fromEntries(
          item.box.lines.map((l) => [l.productId, l.quantity]),
        ),
        // A box saved before supplies existed has neither — the defaulting
        // effect then picks the cheapest of each.
        packagingId: item.box.packaging?.productId ?? null,
        fillingId: item.box.filling?.productId ?? null,
        designs: designsFromBox(item.box),
        // The saved photo was rendered with whatever this box already holds, so
        // it only reads as stale once the shopper changes something.
        heroSupplies: supplySignature({
          ...EMPTY_BOX_DRAFT,
          packagingId: item.box.packaging?.productId ?? null,
          fillingId: item.box.filling?.productId ?? null,
          designs: designsFromBox(item.box),
        }),
        // Only restore the printed box as the main image when it actually was.
        mainImage:
          item.box.packaging?.customPrint &&
          item.product.image === item.box.packaging.customizedImage
            ? item.product.image
            : null,
        editingItemId: item.product.id,
      })
      setError(null)
    }
    setSearchParams({}, { replace: true })
  }, [editParam, cartItems, setSearchParams])

  // ── Opening a pre-configured box ─────────────────────────────────────────
  // A collection card links here as `/build-box?bundle=<product id>`. The box
  // is loaded into the draft exactly as sold, so the first thing the shopper
  // sees is the box they clicked — and the price they were shown holds until
  // they change something. The param is dropped once it has been read, so a
  // refresh does not undo their edits.
  const bundleParam = searchParams.get('bundle')
  // Falls back to the draft's own id once the param has been consumed: the
  // builder needs the box's parts list for as long as it is charging that
  // box's price, not just for the moment it loads it.
  const { data: bundle } = useProduct(bundleParam ?? draft.bundleId ?? '')

  useEffect(() => {
    if (!bundleParam || !bundle?.components?.length) return
    const contents = bundle.components.filter((c) => c.role === 'item')
    setDraft({
      ...EMPTY_BOX_DRAFT,
      bundleId: bundle.id,
      title: bundle.name,
      productIds: contents.map((c) => c.product.id),
      quantities: Object.fromEntries(
        contents.map((c) => [c.product.id, c.quantity]),
      ),
      packagingId:
        bundle.components.find((c) => c.role === 'packaging')?.product.id ?? null,
      fillingId:
        bundle.components.find((c) => c.role === 'filling')?.product.id ?? null,
    })
    // The components came back whole, so the tiles can render before the
    // `by-ids` refetch lands.
    setKnown((prev) => {
      const next = { ...prev }
      for (const component of bundle.components ?? []) {
        next[component.product.id] = component.product
      }
      return next
    })
    setError(null)
    setSearchParams({}, { replace: true })
  }, [bundleParam, bundle, setSearchParams])

  // The line can disappear while it's being edited (removed in another tab), in
  // which case saving falls back to adding a new box.
  const editingItem = draft.editingItemId
    ? cartItems.find((i) => i.product.id === draft.editingItemId)
    : undefined
  const editing = Boolean(editingItem)

  const { data: campaign, error: campaignError } = useCampaign(
    draft.campaignId ?? undefined,
  )
  // The saved box can vanish (deleted from the dashboard) — forget the id and
  // let the next generate start a fresh one instead of failing forever.
  const campaignId = campaignError ? null : draft.campaignId

  const brandSignals = useCampaignBrandSignals()
  const create = useCreateCampaign()
  const update = useUpdateCampaign()
  const regenerate = useRegenerateCampaignHeroImage()
  const generate = useGenerateCampaign()

  const saving =
    create.isPending ||
    update.isPending ||
    regenerate.isPending ||
    generate.isPending
  const generating = saving || campaign?.heroImageStatus === 'pending'
  const imageUrl = campaign?.heroImageUrl ?? null
  // Only trust the stored image when it was rendered from the box on screen.
  const imageMatchesBox =
    campaign !== undefined &&
    campaign.heroImageProductIds.length === draft.productIds.length &&
    campaign.heroImageProductIds.every((id, i) => id === draft.productIds[i])
  // The campaign snapshots the products it rendered, but knows nothing about
  // the box and filling — so swapping those is tracked here instead.
  const signature = supplySignature(draft)
  const suppliesChanged =
    draft.heroSupplies !== null && draft.heroSupplies !== signature
  const imageStale =
    Boolean(imageUrl) && (!imageMatchesBox || suppliesChanged) && !generating
  const failed =
    !generating && (campaign?.heroImageStatus === 'failed' || Boolean(error))

  // Every product can carry its own design now, not just the box — so a line's
  // customized image comes from the draft when the shopper made one, and the
  // `customPrint` flag stops the cart's catalog refresh from reverting it.
  const lines: BoxLine[] = useMemo(
    () =>
      products.map((p) => {
        const design = designFor(draft, p.id)
        const line = toBoxLine(p, quantityOf(p.id))
        return design
          ? { ...line, customizedImage: design.image, customPrint: true }
          : line
      }),
    [products, quantityOf, draft],
  )
  /**
   * What in this box has actually been designed, and what has not.
   *
   * The render only brands what already carries branding — an undesigned
   * product comes back plain, which is the honest picture of what was ordered.
   * It is also not what someone expects the first time, having seen earlier
   * boxes come back with a logo on every item, so it is worth saying out loud
   * before the render rather than leaving them to wonder whether it went
   * wrong.
   *
   * Said for a part-designed box too, not just an entirely plain one. The
   * surprise is the same either way, and it is arguably sharper next to a
   * product that IS branded: a shopper who designed one of three had no
   * warning that the other two were going to come back bare.
   */
  const designedProducts = useMemo(
    () => products.filter((p) => Boolean(designFor(draft, p.id))),
    [products, draft],
  )
  const undesignedProducts = useMemo(
    () => products.filter((p) => !designFor(draft, p.id)),
    [products, draft],
  )
  const nothingDesigned = products.length > 0 && designedProducts.length === 0
  const anyUndesigned = undesignedProducts.length > 0
  /**
   * "Mug", "Mug and Tote", "Mug, Tote and Notebook", "Mug, Tote, Notebook and
   * 2 more". Named products are the difference between advice and a next step,
   * and a box can hold more of them than a sentence can carry.
   */
  const nameList = (items: Product[]): string => {
    const names = items.slice(0, 3).map((p) => p.name)
    const rest = items.length - names.length
    if (names.length === 1 && rest === 0) return names[0]
    if (rest > 0) {
      return t('buildBox.andMore', { list: names.join(', '), count: rest })
    }
    return t('buildBox.listAnd', {
      list: names.slice(0, -1).join(', '),
      last: names[names.length - 1],
    })
  }
  /** Open while confirming a box that will be photographed unbranded. */
  const [confirmingPlain, setConfirmingPlain] = useState(false)

  // One box, one lot of filling — the supplies don't scale with the contents.
  // A printed design rides on the line as its customized image, so the cart
  // and the order show the box the shopper actually designed.
  const packagingDesign = designFor(draft, draft.packagingId)
  const packagingLine = packaging
    ? {
        ...toBoxLine(packaging, 1),
        // Only the shopper's own print, never the catalogue's branded box —
        // the box is designable too, so a pre-branded one reads as finished.
        customizedImage: packagingDesign?.image ?? null,
        customPrint: Boolean(packagingDesign),
      }
    : null
  const fillingLine = filling ? toBoxLine(filling, 1) : null
  const supplyLines = [packagingLine, fillingLine].filter(
    (l): l is BoxLine => Boolean(l),
  )

  // ── Main image ───────────────────────────────────────────────────────────
  // The box can be shown as the photographed bundle or as any of the printed-box
  // designs. Whichever is selected is what the cart shows for this line.
  // The bundle photo and the box's current printed design. Using a new design
  // replaces the last one, so at most one printed box is ever offered.
  const imageOptions = useMemo(() => {
    const options: { url: string; label: string }[] = []
    if (imageUrl)
      options.push({ url: imageUrl, label: t('buildBox.bundlePhoto') })
    if (packagingDesign) {
      options.push({
        url: packagingDesign.image,
        label: t('buildBox.printedBox'),
      })
    }
    for (const product of products) {
      const design = designFor(draft, product.id)
      if (design) options.push({ url: design.image, label: product.name })
    }
    return options
  }, [imageUrl, packagingDesign, products, draft])

  const mainImage =
    (draft.mainImage &&
      imageOptions.some((o) => o.url === draft.mainImage) &&
      draft.mainImage) ||
    imageOptions[0]?.url ||
    null

  const selectMainImage = (url: string) =>
    setDraft((d) => ({ ...d, mainImage: url }))

  const productsSubtotal = boxSubtotal(lines)
  const suppliesSubtotal = boxSubtotal(supplyLines)
  const partsSubtotal = productsSubtotal + suppliesSubtotal

  /**
   * A ready-made box keeps its own price only while it is still that box.
   *
   * Those boxes are sold for less than their contents come to, which is what
   * makes them an offer. Swap a product or change a quantity and there is no
   * offer left to honour, so the price becomes the sum of the parts — shown
   * here as it happens, and checked again by the server before anything is
   * recorded.
   */
  const bundleIntact = Boolean(
    draft.bundleId &&
      bundle?.components &&
      sameComposition([...lines, ...supplyLines], bundle.components),
  )
  const subtotal = bundleIntact && bundle ? bundle.price : partsSubtotal
  const pieceCount = lines.reduce((sum, l) => sum + l.quantity, 0)
  const currency = products[0]?.currency ?? packaging?.currency
  const fallbackTitle = `${brand.companyName} box`

  /**
   * Hand off to the design editor. The draft is already on disk — the editor
   * reads it there and writes the result straight back, so nothing has to be
   * threaded through the URL beyond where to return to.
   */
  const openDesigner = (id: string) =>
    navigate(`/design/${encodeURIComponent(id)}?return=/build-box`)

  const addProduct = (product: Product) => {
    setKnown((prev) => ({ ...prev, [product.id]: product }))
    setDraft((d) =>
      d.productIds.includes(product.id)
        ? d
        : { ...d, productIds: [...d.productIds, product.id] },
    )
    setAddOpen(false)
  }

  const removeProduct = (id: string) =>
    setDraft((d) => {
      const { [id]: _dropped, ...quantities } = d.quantities
      return {
        ...d,
        productIds: d.productIds.filter((p) => p !== id),
        quantities,
      }
    })

  // Emptying the box keeps the shopper in edit mode — they're still working on
  // the same cart line, just from scratch.
  const startOver = () => {
    setDraft((d) => ({ ...EMPTY_BOX_DRAFT, editingItemId: d.editingItemId }))
    setError(null)
  }

  const cancelEditing = () => {
    setDraft((d) => ({ ...d, editingItemId: null }))
    navigate('/cart')
  }

  /**
   * Hand the whole box to the AI: it picks the products from the brief (and the
   * brand), writes a name, and renders the image — all in one blocking request,
   * so this replaces whatever was in the box.
   */
  const generateBox = async () => {
    setError(null)
    try {
      const created = await generate.mutateAsync({
        brand: brandSignals,
        bundleSize: AI_BOX_SIZE,
        brief: brief.trim() || undefined,
        // Assembly renders a box photo too, and nothing it has just picked
        // has been designed — so it is photographed plain, like the tiles it
        // lands in. See `HeroImageSupplies.plainUnlessDesigned`.
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
        title: created.title,
        productIds: created.productIds,
        quantities: {},
      }))
      posthog?.capture('box generated', {
        campaign_id: created.id,
        product_count: created.productIds.length,
        has_brief: Boolean(brief.trim()),
        domain,
      })
    } catch (err) {
      setError(errorMessage(err, t('buildBox.assembleFailed')))
    }
  }

  /**
   * Ask first if anything in the box is going to be photographed plain, then
   * render.
   *
   * Confirming goes straight to the render rather than remembering the answer:
   * the state that would need remembering is the one that disappears the
   * moment they design the product they were asked about.
   */
  const startBuildImage = () => {
    if (anyUndesigned) return setConfirmingPlain(true)
    void buildImage()
  }

  /**
   * Persist the box, then render its image. A first build creates the campaign;
   * later builds save the edits (which regenerates on their own when the bundle
   * changed) and otherwise ask for a re-render explicitly.
   */
  const buildImage = async () => {
    if (products.length === 0) return
    setError(null)
    const title = draft.title.trim() || fallbackTitle

    try {
      // Photograph the bundle in the box and filling the shopper actually
      // chose, printed design included, rather than a generic kraft box.
      // Every design the shopper made rides along, so the group shot shows the
      // branded products and the printed box rather than plain catalogue stock.
      const productImages: Record<string, string> = {}
      for (const product of products) {
        const design = designFor(draft, product.id)
        if (design) productImages[product.id] = design.image
      }
      const supplies = {
        ...(draft.packagingId ? { packagingId: draft.packagingId } : {}),
        ...(draft.fillingId ? { fillingId: draft.fillingId } : {}),
        ...(packagingDesign
          ? { packagingImageUrl: packagingDesign.image }
          : {}),
        ...(Object.keys(productImages).length > 0 ? { productImages } : {}),
        // Anything absent from `productImages` above has not been designed, and
        // is photographed exactly as its tile shows it: plain. Without this the
        // render reached past the tile for the company's branded shot, so a box
        // of two bare products came back with a logo on both.
        plainUnlessDesigned: true,
      }

      if (!campaignId) {
        const created = await create.mutateAsync({
          title,
          domain,
          productIds: draft.productIds,
        })
        setDraft((d) => ({ ...d, campaignId: created.id, title }))
        await regenerate.mutateAsync({ id: created.id, supplies })
      } else {
        const saved = await update.mutateAsync({
          id: campaignId,
          // The supplies ride along: changing the bundle re-renders by itself,
          // and that render is the one the explicit call below deliberately
          // skips. Sent unsteered, it fell back to the catalogue's branded
          // shots — the exact thing the flag exists to prevent.
          input: { title, productIds: draft.productIds, supplies },
        })
        // An unchanged bundle doesn't auto-regenerate — ask for it directly.
        if (saved.heroImageStatus !== 'pending') {
          await regenerate.mutateAsync({ id: saved.id, supplies })
        }
      }
      // Asking for a new bundle photo means wanting to see it — fall back to
      // the default so the render that lands becomes the main image. Record
      // what it's being rendered with, so a later swap reads as stale.
      setDraft((d) => ({ ...d, mainImage: null, heroSupplies: signature }))
      posthog?.capture('box image generated', {
        campaign_id: campaignId,
        product_count: products.length,
        domain,
      })
    } catch (err) {
      setError(errorMessage(err, t('buildBox.imageFailed')))
    }
  }

  /**
   * The box goes into the cart as ONE line item: a synthetic client-side
   * product carrying the box's name, image and total price. The id is a real
   * UUID (the campaign id when we have one) so the cart's by-ids hydration
   * lookup stays valid — it simply never matches a catalog row and the
   * snapshot is kept as-is. What's *inside* rides along as `BoxDetails` so the
   * cart can list the contents and hand them back here for editing.
   */
  const boxProduct = (id: string, title: string): Product => ({
    id,
    sku: `${BOX_SKU_PREFIX}${id.slice(0, 8).toUpperCase()}`,
    name: title,
    tagline: t('buildBox.giftBoxTagline', { count: pieceCount }),
    price: subtotal,
    currency,
    category: t('buildBox.giftBox'),
    image: mainImage ?? products[0].image,
    customizedImage: null,
    description: t('buildBox.giftBoxWith', {
      contents: lines
        .map((l) => (l.quantity > 1 ? `${l.name} × ${l.quantity}` : l.name))
        .join(', '),
    }),
    // Packaging and filling ride along so the line item alone is enough to
    // fulfil the order.
    details: [
      ...lines.map((l) => `${l.name} × ${l.quantity}`),
      ...(packagingLine ? [`Box: ${packagingLine.name}`] : []),
      ...(fillingLine ? [`Filling: ${fillingLine.name}`] : []),
    ],
  })

  const saveBoxToCart = () => {
    if (products.length === 0) return
    const title = draft.title.trim() || fallbackTitle
    const box: BoxDetails = {
      campaignId,
      // Only claimed while the box is untouched — a changed box is a box of
      // their own, and is priced like one.
      bundleId: bundleIntact ? draft.bundleId : null,
      bundlePrice: bundleIntact && bundle ? bundle.price : null,
      lines,
      packaging: packagingLine,
      filling: fillingLine,
      packagingPrompt: packagingDesign?.prompt ?? null,
      packagingLayout: packagingDesign?.layout ?? null,
      designs: draft.designs,
    }

    // Editing writes back to the line the shopper came from, keeping its id and
    // how many of the box they ordered.
    if (editingItem) {
      updateBoxItem(
        editingItem.product.id,
        boxProduct(editingItem.product.id, title),
        box,
      )
      // The box now lives in the cart — the builder starts fresh next time.
      setDraft(EMPTY_BOX_DRAFT)
      posthog?.capture('box updated in cart', {
        campaign_id: campaignId,
        product_count: products.length,
        piece_count: pieceCount,
        subtotal,
        domain,
      })
      navigate('/cart')
      return
    }

    // Re-adding the same box bumps the quantity of the existing line — but the
    // cart keeps the first snapshot, so a box changed since it was added must
    // become its own line item under a fresh id.
    let id = campaignId ?? crypto.randomUUID()
    const existing = cartItems.find((i) => i.product.id === id)
    if (
      existing &&
      (existing.product.name !== title ||
        !existing.box ||
        // Compares the supplies too — swapping the box changes the price.
        !sameBoxLines(boxAllLines(existing.box), boxAllLines(box)))
    ) {
      id = crypto.randomUUID()
    }

    addItem(boxProduct(id, title), 1, box)
    // Once it's in the cart it belongs to the cart. Coming back to the builder
    // means starting another box — the saved one is reachable via "Edit box".
    setDraft(EMPTY_BOX_DRAFT)
    posthog?.capture('box added to cart', {
      campaign_id: campaignId,
      product_count: products.length,
      piece_count: pieceCount,
      subtotal,
      domain,
    })
    navigate('/cart')
  }

  const outOfStock = products.filter((p) => p.stock === 0)

  return (
    <div className="space-y-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
        <Link to="/">
          <ArrowLeft className="size-4" />
          {t('buildBox.backToShop')}
        </Link>
      </Button>

      <section className="max-w-2xl space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {brand.companyName}
        </p>
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          {editing ? t('buildBox.editTitle') : t('buildBox.buildTitle')}
        </h1>
        <p className="text-lg text-muted-foreground">
          {editing ? t('buildBox.editIntro') : t('buildBox.buildIntro')}
        </p>
      </section>

      {editing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-brand border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <Pencil className="size-4 shrink-0 text-primary" />
            <span>
              <Trans
                i18nKey="buildBox.editingFromCart"
                values={{ name: editingItem?.product.name ?? '' }}
                components={{ 1: <span className="font-medium" /> }}
              />
            </span>
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={cancelEditing}>
            {t('buildBox.cancel')}
          </Button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        {/* ── The box image ─────────────────────────────────────────────── */}
        <div className="space-y-3 lg:sticky lg:top-24">
          <div
            className="relative overflow-hidden rounded-brand border border-border/40 bg-muted/20"
            aria-busy={generating}
          >
            {mainImage ? (
              <button
                type="button"
                onClick={() => setPreview(true)}
                className="block w-full"
                aria-label={t('buildBox.previewImage')}
              >
                {/* The previous render stays up while a new one is in flight. */}
                <img
                  src={mainImage}
                  alt={draft.title || fallbackTitle}
                  className={cn(
                    'aspect-square w-full cursor-zoom-in object-contain transition-opacity',
                    generating ? 'opacity-40' : 'hover:opacity-95',
                  )}
                />
              </button>
            ) : (
              <div className="flex aspect-square flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
                <Gift className="size-8" />
                {products.length === 0
                  ? t('buildBox.emptyIntro')
                  : t('buildBox.readyToBuild')}
              </div>
            )}

            {generating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 px-6 text-center">
                <Loader2 className="size-7 animate-spin text-primary" />
                <p className="text-sm font-medium">
                  {generate.isPending
                    ? t('buildBox.assembling')
                    : t('buildBox.photographing')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {generate.isPending
                    ? t('buildBox.pickingProducts')
                    : t('buildBox.takesAMinute')}
                </p>
              </div>
            )}
          </div>

          {/* Bundle photo and every printed-box design, side by side — whichever
              is picked is how this box shows up in the cart. */}
          {imageOptions.length > 1 && (
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label={t('buildBox.boxImage')}
            >
              {imageOptions.map((option) => {
                const active = option.url === mainImage
                return (
                  <button
                    key={option.url}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={option.label}
                    onClick={() => selectMainImage(option.url)}
                    className={cn(
                      'relative size-16 overflow-hidden rounded-brand border bg-muted/20 transition-colors',
                      active
                        ? 'border-primary ring-1 ring-primary'
                        : 'border-border/40 hover:border-border',
                    )}
                  >
                    <img
                      src={option.url}
                      alt={option.label}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  </button>
                )
              })}
            </div>
          )}

          {failed && (
            <p className="flex items-start gap-2 rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span>
                {error ?? campaign?.heroImageError ?? t('buildBox.imageFailed')}
                {t('buildBox.tryAgain')}
              </span>
            </p>
          )}

          {imageStale && (
            <p className="text-xs text-muted-foreground">
              {t('buildBox.boxChanged')}
            </p>
          )}

          <Button
            type="button"
            size="lg"
            className="w-full uppercase tracking-wider"
            onClick={startBuildImage}
            disabled={products.length === 0 || generating}
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('buildBox.building')}
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {imageUrl
                  ? t('buildBox.rebuildImage')
                  : t('buildBox.buildImage')}
              </>
            )}
          </Button>

          <div className="space-y-2 rounded-brand border border-border/40 px-4 py-3">
            {/* Supplies are always charged, so the total is broken out — nobody
                should have to work out where the extra euros came from. */}
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {t('buildBox.products')}
                  {pieceCount > 0 && ` (${pieceCount})`}
                </dt>
                <dd className="tabular-nums">
                  {formatPrice(productsSubtotal, currency)}
                </dd>
              </div>
              {packagingLine && (
                <div className="flex justify-between gap-3">
                  <dt className="min-w-0 truncate text-muted-foreground">
                    {t('buildBox.boxLabel')} · {packagingLine.name}
                  </dt>
                  <dd className="shrink-0 tabular-nums">
                    {formatPrice(packagingLine.price, packagingLine.currency)}
                  </dd>
                </div>
              )}
              {fillingLine && (
                <div className="flex justify-between gap-3">
                  <dt className="min-w-0 truncate text-muted-foreground">
                    {t('buildBox.fillingLabel')} · {fillingLine.name}
                  </dt>
                  <dd className="shrink-0 tabular-nums">
                    {formatPrice(fillingLine.price, fillingLine.currency)}
                  </dd>
                </div>
              )}
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-2">
              <div className="space-y-0.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('buildBox.boxTotal')}
                </p>
                <p className="font-display text-lg font-semibold">
                  {formatPrice(subtotal, currency)}
                </p>
                {/* Says which of the two prices this is, and — once they have
                    changed a ready-made box — why it moved. */}
                {draft.bundleId && (
                  <p className="text-xs text-primary">
                    {bundleIntact
                      ? t('cart.bundleKept')
                      : t('cart.bundleChanged')}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                onClick={saveBoxToCart}
                disabled={products.length === 0}
              >
                <ShoppingBag className="size-4" />
                {editing ? t('buildBox.saveToCart') : t('buildBox.addToCart')}
              </Button>
            </div>
          </div>

          {outOfStock.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {outOfStock.length === 1
                ? t('buildBox.outOfStockOne', { name: outOfStock[0].name })
                : t('buildBox.outOfStockMany', { count: outOfStock.length })}
            </p>
          )}
        </div>

        {/* ── Brief + name + contents ───────────────────────────────────── */}
        <div className="space-y-6">
          <div className="space-y-3 rounded-brand border border-border/40 bg-card/40 p-4">
            <div className="space-y-1">
              <label
                htmlFor="box-brief"
                className="flex items-center gap-1.5 text-sm font-medium"
              >
                <Sparkles className="size-4 text-primary" />
                {t('buildBox.letUsPick')}
              </label>
              <p className="text-xs text-muted-foreground">
                {t('buildBox.briefHint', { company: brand.companyName })}
              </p>
            </div>
            <Textarea
              id="box-brief"
              rows={3}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={t('buildBox.briefPlaceholder')}
              disabled={generate.isPending}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button
                type="button"
                onClick={() => void generateBox()}
                disabled={generating}
              >
                {generate.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('buildBox.assembling')}
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    {t('buildBox.pickForMe')}
                  </>
                )}
              </Button>
              {draft.productIds.length > 0 && !generate.isPending && (
                <span className="text-xs text-muted-foreground">
                  {t('buildBox.replacesProducts', {
                    count: draft.productIds.length,
                  })}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="box-name"
              className="text-xs font-medium text-muted-foreground"
            >
              {t('buildBox.boxName')}
            </label>
            <Input
              id="box-name"
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              placeholder={fallbackTitle}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {pieceCount !== products.length
                  ? t('buildBox.inThisBoxPieces', {
                      count: products.length,
                      pieces: pieceCount,
                    })
                  : t('buildBox.inThisBox', { count: products.length })}
              </span>
              <div className="flex items-center gap-1">
                {draft.productIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={startOver}>
                    <RotateCcw className="size-4" />
                    {t('buildBox.startOver')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="size-4" />
                  {t('buildBox.addProduct')}
                </Button>
              </div>
            </div>

            {draft.productIds.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-brand border border-dashed border-border/60 bg-muted/20 px-6 py-12 text-center">
                <ImageIcon className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t('buildBox.emptyBox')}
                </p>
                <Button variant="outline" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" />
                  {t('buildBox.addFirst')}
                </Button>
              </div>
            ) : productsLoading && products.length === 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {draft.productIds.map((id) => (
                  <Skeleton key={id} className="aspect-square rounded-brand" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {products.map((p) => (
                  <CampaignProductTile
                    key={p.id}
                    product={p}
                    onRemove={() => removeProduct(p.id)}
                    quantity={quantityOf(p.id)}
                    onQuantityChange={(qty) => setQuantity(p.id, qty)}
                    onDesign={() => openDesigner(p.id)}
                    designImage={designFor(draft, p.id)?.image}
                    plainImage
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Packaging & filling ─────────────────────────────────────── */}
          <div className="space-y-4 rounded-brand border border-border/40 bg-card/40 p-4">
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Package className="size-4 text-primary" />
                {t('buildBox.packagingAndFilling')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('buildBox.suppliesNote')}
              </p>
            </div>

            <SupplyPicker
              label={t('buildBox.packaging')}
              hint={t('buildBox.packagingHint')}
              options={supplies.packaging}
              selectedId={draft.packagingId}
              // Picking a different box keeps any generated design — it took
              // real time to render, and only confirming a new one replaces it.
              onSelect={(p) => setDraft((d) => ({ ...d, packagingId: p.id }))}
              loading={suppliesLoading}
              previewImage={packagingDesign?.image ?? null}
            />

            {packaging && (
              <div className="flex flex-wrap items-center gap-2 rounded-brand border border-border/40 bg-background/60 px-3 py-2">
                <Wand2 className="size-4 shrink-0 text-primary" />
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {packagingDesign ? (
                    <Trans
                      i18nKey="buildBox.printedWith"
                      values={{
                        prompt:
                          packagingDesign.prompt || t('buildBox.yourDesign'),
                      }}
                      components={{ 1: <span className="text-foreground" /> }}
                    />
                  ) : (
                    t('buildBox.printOnBox')
                  )}
                </p>
                <Button
                  type="button"
                  variant={packagingDesign ? 'ghost' : 'outline'}
                  size="sm"
                  onClick={() => openDesigner(packaging.id)}
                >
                  {packagingDesign
                    ? t('buildBox.changeDesign')
                    : t('buildBox.customiseBox')}
                </Button>
              </div>
            )}

            <SupplyPicker
              label={t('buildBox.filling')}
              hint={t('buildBox.fillingHint')}
              options={supplies.filling}
              selectedId={draft.fillingId}
              onSelect={(p) => setDraft((d) => ({ ...d, fillingId: p.id }))}
              loading={suppliesLoading}
            />
          </div>
        </div>
      </div>

      <AddProductDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingIds={draft.productIds}
        onAdd={addProduct}
        title={t('buildBox.addToYourBox')}
        plainImages
      />


      {/* ── Something in here is going to come back plain ─────────────
          Said before the render, not after, because after is a picture the
          shopper has to interpret. The two ways out are the two real answers:
          go and design something, or take the box as it is. */}
      <AlertDialog
        open={confirmingPlain}
        onOpenChange={(open) => {
          if (!open) setConfirmingPlain(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {nothingDesigned
                ? t('buildBox.plainTitleNone')
                : undesignedProducts.length === 1
                  ? t('buildBox.plainTitleOne', {
                      name: undesignedProducts[0].name,
                    })
                  : t('buildBox.plainTitleMany', {
                      count: undesignedProducts.length,
                    })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {nothingDesigned
                ? products.length === 1
                  ? t('buildBox.plainBodyAllOne', { name: products[0].name })
                  : t('buildBox.plainBodyAllMany', { count: products.length })
                : undesignedProducts.length === 1
                  ? t('buildBox.plainBodySomeOne', {
                      name: undesignedProducts[0].name,
                    })
                  : t('buildBox.plainBodySomeMany', {
                      names: nameList(undesignedProducts),
                    })}
              {/* Which half is safe matters as much as which half is bare —
                  the worry a part-designed box raises is whether asking for
                  the render costs them the work they already did. */}
              {!nothingDesigned &&
                (designedProducts.length === 1
                  ? t('buildBox.designedSafeOne', {
                      name: designedProducts[0].name,
                    })
                  : t('buildBox.designedSafeMany', {
                      names: nameList(designedProducts),
                    }))}
              {packagingDesign ? t('buildBox.boxDesignStillPrints') : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* What to do instead, with the products actually named — "design a
              product" is advice; "design the Mug" is a next step. */}
          <p className="rounded-brand border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <Trans
              i18nKey={
                undesignedProducts.length === 1
                  ? 'buildBox.howToDesignOne'
                  : 'buildBox.howToDesignMany'
              }
              values={{ names: nameList(undesignedProducts) }}
              components={{
                1: <span className="font-medium text-foreground" />,
              }}
            />
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('buildBox.backToEdit')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingPlain(false)
                void buildImage()
              }}
            >
              {t('buildBox.approveAndBuild')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {mainImage && (
        <Dialog open={preview} onOpenChange={setPreview}>
          <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
            <DialogTitle className="sr-only">
              {t('buildBox.boxImage')}
            </DialogTitle>
            <img
              src={mainImage}
              alt={draft.title || fallbackTitle}
              className="max-h-[85vh] w-full rounded-brand object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
