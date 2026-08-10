import {
  AlertTriangle,
  ArrowLeft,
  Gift,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  ShoppingBag,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePostHog } from '@posthog/react'
import { AddProductDialog } from '@/components/AddProductDialog'
import { CampaignProductTile } from '@/components/CampaignProductTile'
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
import { useProductsByIds } from '@/hooks/use-products'
import {
  BOX_SKU_PREFIX,
  boxSubtotal,
  sameBoxLines,
  toBoxLine,
} from '@/lib/box'
import { getProductDisplayImage } from '@/lib/productImage'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/utils/format'
import type { BoxDetails, BoxLine } from '@/types/box'
import type { Product } from '@/types/product'

const STORAGE_KEY = 'atelier-box-draft'

/** How many products the AI puts in a box when it picks for you. */
const AI_BOX_SIZE = 6

/**
 * The shopper's in-progress box. The bundle image can only be rendered for a
 * persisted campaign, so `campaignId` is filled in lazily — the first time the
 * shopper asks for an image — and the picked products live here until then.
 */
interface BoxDraft {
  campaignId: string | null
  title: string
  productIds: string[]
  /** How many of each product the box holds; a missing entry means one. */
  quantities: Record<string, number>
  /**
   * Set while the shopper is editing a box they already put in the cart — the
   * id of that cart line, so saving writes back to it instead of adding a
   * second box.
   */
  editingItemId: string | null
}

const EMPTY_DRAFT: BoxDraft = {
  campaignId: null,
  title: '',
  productIds: [],
  quantities: {},
  editingItemId: null,
}

/** Quantities come back from storage as untrusted JSON — keep whole, sane ones. */
function parseQuantities(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
      out[id] = Math.floor(value)
    }
  }
  return out
}

function loadDraft(): BoxDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_DRAFT
    const parsed = JSON.parse(raw) as Partial<BoxDraft>
    return {
      campaignId: parsed.campaignId ?? null,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      productIds: Array.isArray(parsed.productIds) ? parsed.productIds : [],
      quantities: parseQuantities(parsed.quantities),
      editingItemId:
        typeof parsed.editingItemId === 'string' ? parsed.editingItemId : null,
    }
  } catch {
    return EMPTY_DRAFT
  }
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
  const posthog = usePostHog()
  const { brand } = useBrand()
  const { domain } = useAuth()
  const { items: cartItems, addItem, updateBoxItem } = useCart()
  const [searchParams, setSearchParams] = useSearchParams()

  const [draft, setDraft] = useState<BoxDraft>(loadDraft)
  const [brief, setBrief] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
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
        title: item.product.name,
        productIds: item.box.lines.map((l) => l.productId),
        quantities: Object.fromEntries(
          item.box.lines.map((l) => [l.productId, l.quantity]),
        ),
        editingItemId: item.product.id,
      })
      setError(null)
    }
    setSearchParams({}, { replace: true })
  }, [editParam, cartItems, setSearchParams])

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
  const imageStale = Boolean(imageUrl) && !imageMatchesBox && !generating
  const failed =
    !generating && (campaign?.heroImageStatus === 'failed' || Boolean(error))

  const lines: BoxLine[] = useMemo(
    () => products.map((p) => toBoxLine(p, quantityOf(p.id))),
    [products, quantityOf],
  )
  const subtotal = boxSubtotal(lines)
  const pieceCount = lines.reduce((sum, l) => sum + l.quantity, 0)
  const currency = products[0]?.currency
  const fallbackTitle = `${brand.companyName} box`

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
    setDraft((d) => ({ ...EMPTY_DRAFT, editingItemId: d.editingItemId }))
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
      })
      setKnown((prev) => {
        const next = { ...prev }
        for (const p of created.products) next[p.id] = p
        return next
      })
      setDraft((d) => ({
        campaignId: created.id,
        title: created.title,
        productIds: created.productIds,
        quantities: {},
        editingItemId: d.editingItemId,
      }))
      posthog?.capture('box generated', {
        campaign_id: created.id,
        product_count: created.productIds.length,
        has_brief: Boolean(brief.trim()),
        domain,
      })
    } catch (err) {
      setError(errorMessage(err, 'Could not put a box together.'))
    }
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
      if (!campaignId) {
        const created = await create.mutateAsync({
          title,
          domain,
          productIds: draft.productIds,
        })
        setDraft((d) => ({ ...d, campaignId: created.id, title }))
        await regenerate.mutateAsync(created.id)
      } else {
        const saved = await update.mutateAsync({
          id: campaignId,
          input: { title, productIds: draft.productIds },
        })
        // An unchanged bundle doesn't auto-regenerate — ask for it directly.
        if (saved.heroImageStatus !== 'pending') {
          await regenerate.mutateAsync(saved.id)
        }
      }
      posthog?.capture('box image generated', {
        campaign_id: campaignId,
        product_count: products.length,
        domain,
      })
    } catch (err) {
      setError(errorMessage(err, 'Could not build the box image.'))
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
    tagline: `Gift box · ${pieceCount} item${pieceCount === 1 ? '' : 's'}`,
    price: subtotal,
    currency,
    category: 'Gift box',
    image: imageUrl ?? getProductDisplayImage(products[0]),
    customizedImage: null,
    description: `Gift box with: ${lines
      .map((l) => (l.quantity > 1 ? `${l.name} × ${l.quantity}` : l.name))
      .join(', ')}`,
    details: lines.map((l) => `${l.name} × ${l.quantity}`),
  })

  const saveBoxToCart = () => {
    if (products.length === 0) return
    const title = draft.title.trim() || fallbackTitle
    const box: BoxDetails = { campaignId, lines }

    // Editing writes back to the line the shopper came from, keeping its id and
    // how many of the box they ordered.
    if (editingItem) {
      updateBoxItem(
        editingItem.product.id,
        boxProduct(editingItem.product.id, title),
        box,
      )
      setDraft((d) => ({ ...d, editingItemId: null }))
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
        !sameBoxLines(existing.box.lines, lines))
    ) {
      id = crypto.randomUUID()
    }

    addItem(boxProduct(id, title), 1, box)
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
          Back to shop
        </Link>
      </Button>

      <section className="max-w-2xl space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {brand.companyName}
        </p>
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          {editing ? 'Edit your box' : 'Build your box'}
        </h1>
        <p className="text-lg text-muted-foreground">
          {editing
            ? 'Change what’s inside, then save it back to your cart.'
            : 'Pick the pieces you want together, then let us photograph them as one branded gift box.'}
        </p>
      </section>

      {editing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-brand border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <Pencil className="size-4 shrink-0 text-primary" />
            <span>
              Editing{' '}
              <span className="font-medium">{editingItem?.product.name}</span>{' '}
              from your cart — changes apply when you save.
            </span>
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={cancelEditing}>
            Cancel
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
            {imageUrl ? (
              <button
                type="button"
                onClick={() => setPreview(true)}
                className="block w-full"
                aria-label="Preview box image"
              >
                {/* The previous render stays up while a new one is in flight. */}
                <img
                  src={imageUrl}
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
                  ? 'Describe your box or add a few products, and we’ll photograph it for you.'
                  : 'Ready when you are — build the box image.'}
              </div>
            )}

            {generating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 px-6 text-center">
                <Loader2 className="size-7 animate-spin text-primary" />
                <p className="text-sm font-medium">
                  {generate.isPending
                    ? 'Putting your box together…'
                    : 'Photographing your box…'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {generate.isPending
                    ? 'Picking the products, then photographing them.'
                    : 'This can take up to a minute. You can keep adding products.'}
                </p>
              </div>
            )}
          </div>

          {failed && (
            <p className="flex items-start gap-2 rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span>
                {error ??
                  campaign?.heroImageError ??
                  'Could not build the box image.'}{' '}
                Try again.
              </span>
            </p>
          )}

          {imageStale && (
            <p className="text-xs text-muted-foreground">
              Your box changed — build the image again to update it.
            </p>
          )}

          <Button
            type="button"
            size="lg"
            className="w-full uppercase tracking-wider"
            onClick={() => void buildImage()}
            disabled={products.length === 0 || generating}
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Building…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {imageUrl ? 'Rebuild box image' : 'Build box image'}
              </>
            )}
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-brand border border-border/40 px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Box total
              </p>
              <p className="font-display text-lg font-semibold">
                {formatPrice(subtotal, currency)}
              </p>
              {pieceCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {pieceCount} item{pieceCount === 1 ? '' : 's'} in {products.length}{' '}
                  product{products.length === 1 ? '' : 's'}
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
              {editing ? 'Save box to cart' : 'Add box to cart'}
            </Button>
          </div>

          {outOfStock.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {outOfStock.length === 1
                ? `${outOfStock[0].name} is out of stock.`
                : `${outOfStock.length} products in this box are out of stock.`}
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
                Let us pick for you
              </label>
              <p className="text-xs text-muted-foreground">
                Describe the box you want — occasion, who it’s for, the vibe.
                Leave it blank for a box built around {brand.companyName}.
              </p>
            </div>
            <Textarea
              id="box-brief"
              rows={3}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. A cosy winter welcome box for new hires — warm, understated, premium."
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
                    Putting your box together…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Pick products for me
                  </>
                )}
              </Button>
              {draft.productIds.length > 0 && !generate.isPending && (
                <span className="text-xs text-muted-foreground">
                  Replaces the {draft.productIds.length} product
                  {draft.productIds.length === 1 ? '' : 's'} in your box.
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="box-name"
              className="text-xs font-medium text-muted-foreground"
            >
              Box name
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
                In this box ({products.length}
                {pieceCount !== products.length && ` · ${pieceCount} items`})
              </span>
              <div className="flex items-center gap-1">
                {draft.productIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={startOver}>
                    <RotateCcw className="size-4" />
                    Start over
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="size-4" />
                  Add product
                </Button>
              </div>
            </div>

            {draft.productIds.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-brand border border-dashed border-border/60 bg-muted/20 px-6 py-12 text-center">
                <ImageIcon className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Your box is empty. Add products to get started.
                </p>
                <Button variant="outline" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" />
                  Add your first product
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
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddProductDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingIds={draft.productIds}
        onAdd={addProduct}
        title="Add to your box"
      />

      {imageUrl && (
        <Dialog open={preview} onOpenChange={setPreview}>
          <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
            <DialogTitle className="sr-only">Box image</DialogTitle>
            <img
              src={imageUrl}
              alt={draft.title || fallbackTitle}
              className="max-h-[85vh] w-full rounded-brand object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
