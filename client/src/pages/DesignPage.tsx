/**
 * The design editor — one full-screen surface for putting a brand onto
 * anything the shop sells.
 *
 * It is a route rather than a dialog for two reasons. Designing is not a
 * two-minute detour: people nudge a logo, render, nudge again, and a modal that
 * loses everything on a stray Escape is hostile to that. And a route has an
 * address, so the builder, the dashboard and anything added later can all hand
 * off to the same editor without each growing its own copy.
 *
 * The shell is deliberately three columns with room to spare. The left rail
 * lists layers and source images, the centre is nothing but canvas, the right
 * holds the brief and whatever controls this particular subject needs. New
 * tools go in the rails; the canvas never has to shrink to make space.
 *
 * A box and a mug share every part of this except the controls: a box has stock
 * board colours and printable faces, a mug has a scene and an aspect ratio. The
 * server decides which brief to build from the product's category, so the only
 * thing that branches here is which panel to show.
 */

import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Image as ImageIcon,
  ImageUp,
  Layers as LayersIcon,
  Loader2,
  Lock,
  Pencil,
  Redo2,
  RotateCcw,
  Save,
  Send,
  Undo2,
  Sparkles,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ASPECT_RATIOS, KEEP_SCENE_ID, SCENE_TYPES } from '@/api/photoshoot'
import { fileToDataUrl, uploadImages } from '@/api/uploads'
import {
  PlacementCanvas,
  SelectedLayerControls,
  type CanvasLogo,
} from '@/components/canvas/PlacementCanvas'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useBrand } from '@/context/BrandContext'
import { useCart } from '@/context/CartContext'
import { useComposeMockup } from '@/hooks/use-compose'
import {
  useCreateDesignVersion,
  useDeleteDesignVersion,
  useDesignVersions,
  useRenameDesignVersion,
} from '@/hooks/use-design-versions'
import { useHistory } from '@/hooks/use-history'
import { useUpdateProduct } from '@/hooks/use-product-mutations'
import { useCustomizeProduct, useProductsByIds } from '@/hooks/use-products'
import { boxColorOptions, isFullColourBox, PACKAGING_SLUG } from '@/lib/box'
import { designFor, loadBoxDraft, writeDesign } from '@/lib/boxDraft'
import { readProductDesign, writeProductDesign } from '@/lib/productDesign'
import { takeLegacyVersions, versionStamps } from '@/lib/designVersions'
import {
  addLayer,
  defaultImageLayer,
  defaultLogoLayer,
  defaultTextLayer,
  EMPTY_LAYOUT,
  findLogoLayer,
  hasPlacement,
  MAX_LAYERS,
  moveLayer,
} from '@/lib/layout'
import { resolveLogoKind, sanitizeSvgMarkup } from '@/lib/logo'
import { cn } from '@/lib/utils'
import type { DesignVersion } from '@/api/designVersions'
import type { CustomizeProductRequest } from '@/api/products'
import type { PlacementLayer, PlacementLayout } from '@/types/layout'

/** Openers for a box. Each shows a different way to brief one. */
const BOX_EXAMPLES = [
  {
    label: 'Welcome box',
    prompt:
      'A calm welcome-aboard design for a new starter: a thin accent line beneath the logo, and plenty of empty space. Nothing else.',
  },
  {
    label: 'Festive',
    prompt:
      'A festive design with small hand-drawn fir trees scattered across the lid and "Merry Christmas" set beneath them in a warm script.',
  },
  {
    label: 'Thank you',
    prompt:
      'Print "THANK YOU" in a bold uppercase sans-serif in a single accent colour.',
  },
  {
    label: 'Birthday',
    prompt:
      'A cheerful birthday design: confetti dots in mixed colours around the edge of the lid.',
  },
]

/** Scene direction — only offered once the product is being re-photographed. */
const PRODUCT_SCENE_EXAMPLES = [
  { label: 'Clean studio', prompt: 'Clean studio lighting on a soft neutral background.' },
  { label: 'On wood', prompt: 'Resting on a warm oak surface in soft morning light.' },
  { label: 'Editorial', prompt: 'An editorial still life with a muted palette and a long soft shadow.' },
]

/**
 * Direction for the branding itself, for when the photograph is being kept.
 * A scene chip here would quietly undo the whole point of keeping it.
 */
const PRODUCT_FINISH_EXAMPLES = [
  { label: 'Printed', prompt: 'Print the logo flat onto the surface, following its curve and texture.' },
  { label: 'Embroidered', prompt: 'Apply the logo as stitched embroidery, with visible thread texture.' },
  { label: 'Embossed', prompt: 'Deboss the logo into the surface, tonal, catching the light at its edges.' },
  { label: 'Engraved', prompt: 'Laser-engrave the logo into the material, a subtle tonal mark.' },
]

export function DesignPage() {
  const { productId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { brand } = useBrand()
  const { setItemDesign } = useCart()

  /**
   * Where to go back to, and what confirming does with the design.
   *
   * Three subjects, because a design belongs to whatever asked for it:
   *
   *   - `box` (the default) folds it into the box draft — the builder's design
   *     is part of a box being assembled.
   *   - `product` is one product branded on its own, from its own page. It has
   *     no box to belong to, so it is kept against the product for this shopper
   *     and travels with it into the cart and then onto the request.
   *   - `catalogue` is the dashboard branding a product it sells: the approved
   *     picture joins the product's own images, for everyone who sees it.
   *
   * The distinction between the last two is not cosmetic. A shopper must not be
   * able to rewrite the catalogue's photographs, and the dashboard has no cart
   * to carry a design into — folding them together would have done both.
   */
  const returnTo = searchParams.get('return') || '/build-box'
  const to = searchParams.get('to')
  const target =
    to === 'catalogue' ? 'catalogue' : to === 'product' ? 'product' : 'box'

  const { data: loaded, isLoading } = useProductsByIds(
    productId ? [productId] : [],
  )
  const product = loaded?.[0] ?? null

  /**
   * Whatever design this subject already has, read once on the way in —
   * routing is what syncs the pages, so there is nothing live to subscribe to.
   *
   * The catalogue target reads nothing: its designs land in the product's
   * images, which the picker already offers as sources, so there is no single
   * "current" one to resume.
   */
  const [saved] = useState(() =>
    target === 'box'
      ? designFor(loadBoxDraft(), productId)
      : target === 'product'
        ? readProductDesign(productId)
        : null,
  )

  // The layout is the only undoable thing in the editor — see `use-history`.
  const history = useHistory<PlacementLayout>(saved?.layout ?? EMPTY_LAYOUT)
  const layout = history.state
  const setLayout = history.set
  const commitLayout = history.commitState
  const [prompt, setPrompt] = useState(saved?.prompt ?? '')

  /**
   * The two renders are held apart rather than collapsed into one `result`.
   *
   * They are not interchangeable. The flat composite is exactly what prints —
   * it is the thing being ordered, and the thing the shopper signs off. The
   * photoreal render is a nicer picture of that same design, and optional.
   * A single field would have made "which one did they approve?" unanswerable.
   *
   * The flat one carries the signature of what produced it, so confirming can
   * tell a current mockup from one built before the last three nudges.
   */
  const [flat, setFlat] = useState<{ url: string; signature: string } | null>(
    saved?.flat ? { url: saved.flat, signature: '' } : null,
  )
  const [photoreal, setPhotoreal] = useState<string | null>(
    // Designs saved before the two were told apart carry one image and no
    // record of its kind. Treat it as a render: the mockup is rebuilt from the
    // layout on the way into confirmation anyway, so nothing is lost.
    saved?.photoreal ?? (saved?.flat ? null : (saved?.image ?? null)),
  )
  const [view, setView] = useState<'layout' | 'flat' | 'photoreal'>('layout')
  /** Open while the shopper is looking at what they are about to approve. */
  const [confirming, setConfirming] = useState(false)
  /** Open while confirming they want to throw the design away. */
  const [discarding, setDiscarding] = useState(false)
  const [preparing, setPreparing] = useState(false)
  /**
   * Which of the two stands in for the design elsewhere in the shop. Off by
   * default: the exact one is the safer thing to show against an order, and
   * anyone who wants the prettier picture can say so here.
   */
  const [useRenderForImage, setUseRenderForImage] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  /** Open while a new version is being named. Naming is the point of a save. */
  const [namingVersion, setNamingVersion] = useState(false)
  /**
   * One save per naming session.
   *
   * Enter starts the save, which disables the field — and disabling a focused
   * input fires `blur`, so the blur handler ran straight after and wrote the
   * version a second time. A ref rather than state because both handlers run
   * in the same tick, before any re-render could tell them apart.
   */
  const namingSubmitted = useRef(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  // Default to leaving the photograph alone. The editor's job is the mark on
  // the product; restaging is a separate thing you ask for.
  const [sceneType, setSceneType] = useState<string>(KEEP_SCENE_ID)
  const [aspectRatio, setAspectRatio] = useState<string>(ASPECT_RATIOS[0].id)
  const [baseImage, setBaseImage] = useState<string | null>(null)
  // A mark used instead of the company logo for this design. Held as a served
  // URL, not a data URL — see `ProductDesign.logoUrl`.
  const [logoOverride, setLogoOverride] = useState<string | null>(
    saved?.logoUrl ?? null,
  )
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingArt, setUploadingArt] = useState(false)
  // Shared by both upload entry points — a mark on a coloured product almost
  // always wants its white background gone, so it defaults on.
  const [knockOutWhite, setKnockOutWhite] = useState(true)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const artInputRef = useRef<HTMLInputElement>(null)

  const customize = useCustomizeProduct(productId)
  const compose = useComposeMockup()
  const { versions, canSave } = useDesignVersions(productId)
  const createVersion = useCreateDesignVersion(productId)
  const renameVersionMutation = useRenameDesignVersion(productId)
  const deleteVersionMutation = useDeleteDesignVersion(productId)
  const updateProduct = useUpdateProduct()
  const busy = customize.isPending || compose.isPending

  const isBox = product?.categorySlug === PACKAGING_SLUG
  const fullColour = isBox && isFullColourBox(product?.name, product?.description)
  const colors = isBox && !fullColour ? boxColorOptions(product?.description) : []

  /**
   * Sources to design on, plain catalogue photo first.
   *
   * Deliberately NOT `getProductDisplayImage`, which prefers the company's
   * already-branded shot: placing a logo on a product that is wearing one
   * brands it twice. The branded shot stays available in the picker for anyone
   * who does want to build on it.
   */
  const gallery = useMemo(() => {
    if (!product) return []
    return Array.from(
      new Set(
        [product.image, ...(product.images ?? []), product.customizedImage]
          .filter((src): src is string => Boolean(src)),
      ),
    )
  }, [product])

  const source = baseImage ?? gallery[0] ?? null

  /**
   * What the source picker offers.
   *
   * `gallery` is the product's own photos, but the design may be sitting on
   * something else — restoring a version sets a source that was saved when the
   * product had a different set of images. Left out, that photo has no swatch:
   * nothing is highlighted and there is no way back to it. So whatever is
   * actually in use is always in the strip.
   */
  const sources = useMemo(
    () =>
      source && !gallery.includes(source) ? [source, ...gallery] : gallery,
    [gallery, source],
  )

  const brandLogoKind = resolveLogoKind(brand.logo, brand.logoType)
  // An uploaded mark wins over the company one for this design only.
  const logoKind = logoOverride ? ('url' as const) : brandLogoKind
  const logoValue = logoOverride ?? brand.logo
  const canvasLogo: CanvasLogo | null =
    logoKind !== 'none' && logoValue
      ? { kind: logoKind, value: logoValue }
      : null

  const pickLogo = async (file: File | undefined) => {
    if (!file) return
    setUploadingLogo(true)
    try {
      // Upload on pick rather than at render time: the canvas, the flat
      // mockup, the photoreal pass and the saved draft then all reference one
      // URL instead of passing a base64 blob between them.
      const [url] = await uploadImages([await fileToDataUrl(file)], {
        transparent: knockOutWhite,
      })
      setLogoOverride(url)
      // Uploading a mark when none is placed is a request to place it.
      if (!findLogoLayer(layout)) addAndSelect(defaultLogoLayer())
    } finally {
      setUploadingLogo(false)
    }
  }

  const placed = hasPlacement(layout)
  /**
   * Re-photographing the product is a dashboard job.
   *
   * A shopper branding a product, or building a box, wants their mark on the
   * photograph in front of them — being asked to pick a scene first suggests
   * the photo is up for grabs, which it is not. Only the dashboard's own
   * entry point (`?to=catalogue`) offers it.
   */
  const canRestage = !isBox && target === 'catalogue'
  const keepScene = sceneType === KEEP_SCENE_ID

  // The company's own palette, offered before the colour picker — wording on a
  // branded box is nearly always one of these.
  const brandColors = useMemo(
    () =>
      [
        ...new Set(
          [brand.primaryColor, brand.secondaryColor, ...(brand.otherColors ?? []),
           '#ffffff', '#1f2933']
            .filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c))
            .map((c) => c.toLowerCase()),
        ),
      ].slice(0, 8),
    [brand.primaryColor, brand.secondaryColor, brand.otherColors],
  )
  const selected = layout.layers.find((l) => l.id === selectedId) ?? null
  const examples = isBox
    ? BOX_EXAMPLES
    : keepScene
      ? PRODUCT_FINISH_EXAMPLES
      : PRODUCT_SCENE_EXAMPLES

  const brandingFields = (): Pick<
    CustomizeProductRequest,
    'brandingImage' | 'brandingImageUrl' | 'brandingSvg'
  > => {
    if (!findLogoLayer(layout) || !logoValue) return {}
    if (logoKind === 'data-uri') return { brandingImage: logoValue }
    if (logoKind === 'svg') return { brandingSvg: logoValue }
    if (logoKind === 'url') return { brandingImageUrl: logoValue }
    return {}
  }

  /**
   * Add a layer and select it.
   *
   * Selecting is not a nicety: the properties strip only renders for the
   * selected layer, so adding without selecting leaves the new thing with no
   * way to edit its text, colour or size until you go and find it in the rail.
   */
  const addAndSelect = (layer: PlacementLayer) => {
    commitLayout((l) => addLayer(l, layer))
    setSelectedId(layer.id)
    setView('layout')
  }

  const addLogo = () => {
    const existing = findLogoLayer(layout)
    if (existing) return setSelectedId(existing.id)
    addAndSelect(defaultLogoLayer())
  }
  const addText = () => addAndSelect(defaultTextLayer('Your text'))

  const pickArtwork = async (file: File | undefined) => {
    if (!file) return
    setUploadingArt(true)
    try {
      const [url] = await uploadImages([await fileToDataUrl(file)], {
        transparent: knockOutWhite,
      })
      addAndSelect(defaultImageLayer(url))
    } finally {
      setUploadingArt(false)
    }
  }

  const reorder = (id: string, direction: 'up' | 'down') =>
    commitLayout((l) => moveLayer(l, id, direction))

  /**
   * Carry over anything the old local-only build saved.
   *
   * Versions used to be written to `localStorage` on every confirmation and
   * were never shown, so people have history they have never seen. Upload it
   * once and let it appear rather than dropping it on the way to the server.
   * Best-effort by design: `takeLegacyVersions` clears the key as it reads, so
   * a failure costs an invisible entry rather than a retry on every page load.
   */
  const createVersionAsync = createVersion.mutateAsync
  useEffect(() => {
    if (!productId || !canSave) return
    const legacy = takeLegacyVersions(productId)
    if (!legacy.length) return
    void (async () => {
      for (const version of legacy) {
        try {
          await createVersionAsync(version)
        } catch {
          // An entry nobody has ever seen is not worth failing a page load for.
        }
      }
    })()
  }, [productId, canSave, createVersionAsync])

  // ⌘Z / ⇧⌘Z, but never while the caret is in a field — there, the browser's
  // own text undo is what the user means.
  const { undo, redo } = history
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const target = event.target as HTMLElement | null
      if (
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
      ) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  const canGenerate = Boolean(prompt.trim() || placed) && !busy && Boolean(source)

  /**
   * What the current mockup would be built from. Anything here changing means
   * a mockup made earlier is no longer a picture of this design.
   */
  const layoutSignature = useMemo(
    () => JSON.stringify({ source, logo: logoValue ?? null, layout }),
    [source, logoValue, layout],
  )
  const flatIsCurrent = Boolean(flat && flat.signature === layoutSignature)

  const generate = async () => {
    if (!canGenerate || !source) return
    const res = await customize.mutateAsync({
      prompt: prompt.trim() || undefined,
      productImageUrl: source,
      ...(placed ? { layout } : {}),
      ...(isBox
        ? color
          ? { color }
          : {}
        : {
            sceneType,
            // Re-framing only makes sense when a new photograph is being
            // composed; keeping the original means keeping its shape.
            ...(keepScene ? {} : { aspectRatio }),
          }),
      ...brandingFields(),
    })
    setPhotoreal(res.url)
    setView('photoreal')
    return res.url
  }

  /** Build the flat mockup unless the one we have is still a picture of this. */
  const ensureFlat = async (): Promise<string | null> => {
    if (!source) return null
    if (flat && flat.signature === layoutSignature) return flat.url
    const res = await compose.mutateAsync({
      baseImageUrl: source,
      layout,
      ...brandingFields(),
    })
    setFlat({ url: res.url, signature: layoutSignature })
    return res.url
  }

  /**
   * A version needs a picture to be a version. Same shape as `canConfirm`,
   * minus the photoreal-only case: a render with nothing placed and no brief
   * has no state worth coming back to.
   */
  const canSaveVersion =
    Boolean(source) && !busy && (placed || Boolean(photoreal) || Boolean(flat))

  const canConfirm =
    Boolean(source) &&
    !busy &&
    !preparing &&
    (placed || Boolean(prompt.trim()) || Boolean(photoreal))

  /**
   * Confirming is one click, not two.
   *
   * Nobody should have to know that a mockup is a separate thing they were
   * supposed to build first — so this builds whatever is missing and then shows
   * it. What it will not do is skip the looking: the shopper approves a picture
   * of their design, never a description of one, because that picture is what
   * gets printed.
   */
  const startConfirm = async () => {
    if (!canConfirm || !source) return
    setPreparing(true)
    try {
      // With something placed, the composite is the design. With only a brief,
      // there is nothing to composite and the render is the design.
      if (placed) await ensureFlat()
      else if (!photoreal) await generate()
      // Approve what they were looking at. Confirming from the photoreal tab
      // used to open on the flat mockup, which reads as a different design.
      setUseRenderForImage(view === 'photoreal' && Boolean(photoreal))
      setConfirming(true)
    } catch {
      // The mutation's error is already on screen in the rail — don't open a
      // confirmation over a design we failed to build.
    } finally {
      setPreparing(false)
    }
  }

  /** Take a typed name once, from whichever handler reaches it first. */
  const commitVersionName = (raw: string) => {
    if (namingSubmitted.current) return
    namingSubmitted.current = true
    void saveVersion(raw)
  }

  /** The exact artwork: the mockup, or the render when nothing is placed. */
  const confirmImage = placed ? (flat?.url ?? null) : (photoreal ?? flat?.url ?? null)

  /**
   * The one picture the dialog shows and the one that gets saved.
   *
   * Shown and approved have to be the same image. They were not: the dialog
   * always showed the composite while this could save the render, so a shopper
   * arriving from the photoreal tab signed off on a picture they had not seen.
   */
  const chosenImage = useRenderForImage && photoreal ? photoreal : confirmImage

  /**
   * Whether the render is standing in for a composite. With nothing placed
   * there is no composite to stand in for — the render is the design — so the
   * dialog's usual "this is what prints" wording still holds there.
   */
  const showingRender = placed && useRenderForImage && Boolean(photoreal)

  /**
   * What the sign-off says is about to happen.
   *
   * Three subjects means three outcomes, and one label for all of them told
   * two thirds of the people using it something untrue: a shopper branding a
   * mug was invited to "approve and add" it to a box they had not started.
   */
  const approveLabel =
    target === 'box'
      ? 'Approve and use'
      : target === 'product'
        ? 'Approve design'
        : 'Approve and add'
  const subjectPhrase = target === 'box' ? 'in your box.' : 'on your product.'

  const approve = async () => {
    if (!chosenImage || !confirmImage || !source) return
    const chosen = chosenImage

    // Confirming deliberately does NOT write a version. Approving is what puts
    // a design into an order; keeping a named checkpoint is a separate decision,
    // and folding the two together produced a history nobody asked for.
    if (target === 'catalogue' && product) {
      const existing = product.images?.length ? product.images : [product.image]
      const next = Array.from(new Set([...existing, chosen]))
      await updateProduct.mutateAsync({ id: product.id, input: { images: next } })
      // Back where the job started. Approving is the end of the errand, and
      // the product page is where the new image is actually of use — staying
      // put left people on a canvas they were finished with, wondering whether
      // anything had happened. The mutation invalidates the product first, so
      // the image is already there when the page renders.
      setConfirming(false)
      navigate(returnTo)
      return
    }

    // One product, branded on its own.
    //
    // Keep the placement, not just the picture: a product branded from its own
    // page has no box draft to live in, so without this the request that
    // follows carries artwork nobody can reproduce or adjust.
    //
    // Nothing here reaches the server. A design a shopper made is theirs and
    // travels on their order; it is deliberately NOT added to the product's
    // images, because those are the photographs the editor offers as things to
    // design ON. Every confirmed design used to land there, so the source
    // picker filled up with other people's finished work — and the next person
    // to open the editor was invited to start from it. Only the dashboard,
    // which is choosing what the product looks like for everyone, writes
    // there — see the branch above.
    if (target === 'product') {
      const design = {
        image: chosen,
        flat: confirmImage,
        photoreal,
        prompt: prompt.trim() || null,
        layout: placed ? layout : null,
        logoUrl: logoOverride,
      }
      writeProductDesign(productId, design)
      // And into the basket, if this product is already in it. Someone who
      // adds a product, then goes back and brands it, means the one they are
      // buying — not a design filed away for next time.
      setItemDesign(productId, design)
      setConfirming(false)
      navigate(returnTo)
      return
    }

    // Into the box draft, which is what the box is actually built from. Local
    // and instant, and — like the single-product branch above — it goes no
    // further: a shopper's box design is not one of the product's source
    // photographs.
    writeDesign(productId, {
      image: chosen,
      flat: confirmImage,
      photoreal,
      prompt: prompt.trim() || null,
      layout: placed ? layout : null,
      logoUrl: logoOverride,
    })

    navigate(returnTo)
  }

  /**
   * Bring a saved version back — all of it.
   *
   * The photo, the layout, the brief, the logo and both renders move together.
   * Restoring the picture alone would leave the canvas showing a layout that
   * never produced it, and that mismatch survives all the way to an order.
   */
  const restoreVersion = (version: DesignVersion) => {
    setBaseImage(version.source)
    commitLayout(version.layout ?? EMPTY_LAYOUT)
    setPrompt(version.prompt ?? '')
    setLogoOverride(version.logoUrl ?? null)
    // Signature left empty on purpose: the mockup gets rebuilt from the restored
    // layout when it is next confirmed, so what is approved is never a leftover.
    setFlat(version.flat ? { url: version.flat, signature: '' } : null)
    setPhotoreal(version.photoreal)
    setSelectedId(null)
    // Land on the canvas, not the mockup. Restoring is about getting the design
    // back to work on, and the photo it sits on is half of what came back — a
    // flat render would hide the very thing that was just restored.
    setView('layout')
  }

  /**
   * Keep a named checkpoint of where the design stands.
   *
   * Builds the mockup first if the one in hand is stale, for the same reason
   * confirming does: a version is the set, and a set missing the picture of
   * what was placed is not one. Naming is the whole point, so the label comes
   * from the person rather than a counter.
   */
  const saveVersion = async (label: string) => {
    if (!source || !canSave || createVersion.isPending) return
    setPreparing(true)
    try {
      const flatUrl = placed ? await ensureFlat() : (flat?.url ?? null)
      await createVersion.mutateAsync({
        label,
        source,
        flat: flatUrl,
        photoreal,
        prompt: prompt.trim() || null,
        layout: placed ? layout : null,
        logoUrl: logoOverride,
      })
      setNamingVersion(false)
    } catch {
      // The mutation's error surfaces in the rail; keep the name field open so
      // the work is not lost to a failed request — and let it be tried again.
      namingSubmitted.current = false
    } finally {
      setPreparing(false)
    }
  }

  /** Only offer a view once there is something behind it. */
  const views = [
    { id: 'layout' as const, label: 'Placement', hint: 'Move things around' },
    ...(flat
      ? [
          {
            id: 'flat' as const,
            label: 'Exact mockup',
            hint: 'Precisely what gets printed',
          },
        ]
      : []),
    ...(photoreal
      ? [
          {
            id: 'photoreal' as const,
            label: 'Photoreal',
            hint: 'A presentation render of the same design',
          },
        ]
      : []),
  ]
  const shownImage =
    view === 'flat' ? (flat?.url ?? null) : view === 'photoreal' ? photoreal : null

  /**
   * Anything on the canvas that came from a person.
   *
   * Drives whether discarding is offered at all. It used to appear only for a
   * box that already had a saved design, which meant the way out of a design
   * you had just made was to leave the page and hope.
   */
  const hasDesign =
    placed || Boolean(prompt.trim()) || Boolean(flat) || Boolean(photoreal)

  /**
   * Back to the bare product photo.
   *
   * Discarding used to navigate away, which read as "leave" rather than "clear"
   * — so the button did something different from what it said. Now it empties
   * the canvas and leaves you looking at the source image, which is where you
   * would start a new design from anyway.
   *
   * The draft goes too. Leaving it behind meant pressing Back brought the
   * discarded design straight back into the box.
   */
  const discardDesign = () => {
    commitLayout(EMPTY_LAYOUT)
    setPrompt('')
    setFlat(null)
    setPhotoreal(null)
    setSelectedId(null)
    // The box's printed colour is part of the design, not a view setting.
    setColor(null)
    setView('layout')
    // Forget where it was kept, too. Leaving it behind meant pressing Back
    // brought the discarded design straight back. The catalogue keeps nothing
    // of its own — its designs are the product's images, and dropping one of
    // those is a deliberate edit, not a side effect of clearing a canvas.
    if (target === 'box') writeDesign(productId, null)
    else if (target === 'product') {
      writeProductDesign(productId, null)
      setItemDesign(productId, null)
    }
    setDiscarding(false)
  }

  const mutationError = customize.error ?? compose.error
  const error = mutationError
    ? ((mutationError as { response?: { data?: { error?: string } } }).response
        ?.data?.error ?? (mutationError as Error).message)
    : null

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          That product could not be found.
        </p>
        <Button variant="outline" onClick={() => navigate(returnTo)}>
          <ArrowLeft className="size-4" />
          Go back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh lg:overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(returnTo)}
          disabled={busy}
          className="text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Undo"
            title="Undo (⌘Z)"
            onClick={history.undo}
            disabled={!history.canUndo || busy}
            className="px-2 text-muted-foreground"
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
            onClick={history.redo}
            disabled={!history.canRedo || busy}
            className="px-2 text-muted-foreground"
          >
            <Redo2 className="size-4" />
          </Button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            {isBox ? 'Printed gift box' : 'Branded product'}
          </p>
        </div>
        {hasDesign && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setDiscarding(true)}
            disabled={busy}
            title="Clear the canvas and start from the product photo"
          >
            <Trash2 className="size-4" />
            Discard design
          </Button>
        )}
        {/* No action button up here. The one that finishes the job lives with
            the other controls in the right rail, where the eye is already
            working — a corner is where things go to be missed. */}
      </header>

      <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        {/* ── Left rail: layers and sources ─────────────────────────── */}
        <aside className="shrink-0 space-y-4 border-b border-border/40 p-4 lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <LayersIcon className="size-3.5" />
              Layers
            </p>
            {layout.layers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing placed yet. Add your logo or some wording.
              </p>
            ) : (
              <ul className="space-y-1">
                {/* Rendered top-of-stack first, because that is what the eye
                    expects from a layer list — the array itself is
                    bottom-first, since that is the order both renderers paint
                    in. */}
                {[...layout.layers].reverse().map((layer, i) => {
                  const index = layout.layers.length - 1 - i
                  return (
                    <li key={layer.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(layer.id)
                          setView('layout')
                        }}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-2 rounded-brand border px-2 py-1.5 text-left text-xs transition-colors',
                          selectedId === layer.id
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border/40 text-muted-foreground hover:border-border',
                        )}
                      >
                        {layer.kind === 'logo' ? (
                          <Sparkles className="size-3.5 shrink-0" />
                        ) : layer.kind === 'image' ? (
                          <ImageIcon className="size-3.5 shrink-0" />
                        ) : (
                          <Type className="size-3.5 shrink-0" />
                        )}
                        <span className="truncate">
                          {layer.kind === 'logo'
                            ? 'Brand logo'
                            : layer.kind === 'image'
                              ? 'Artwork'
                              : layer.text}
                        </span>
                        {layer.locked && <Lock className="size-3 shrink-0 opacity-70" />}
                      </button>
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          aria-label="Bring forward"
                          disabled={busy || index === layout.layers.length - 1}
                          onClick={() => reorder(layer.id, 'up')}
                          className="flex size-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          aria-label="Send backward"
                          disabled={busy || index === 0}
                          onClick={() => reorder(layer.id, 'down')}
                          className="flex size-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronDown className="size-3" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={addLogo}
                disabled={busy || !canvasLogo || Boolean(findLogoLayer(layout))}
                title={canvasLogo ? undefined : 'Add a logo below first'}
              >
                Add logo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={addText}
                disabled={busy || layout.layers.length >= MAX_LAYERS}
              >
                Add wording
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => artInputRef.current?.click()}
                disabled={busy || uploadingArt || layout.layers.length >= MAX_LAYERS}
              >
                {uploadingArt ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <ImageUp className="size-3" />
                )}
                Add artwork
              </Button>
            </div>
            <input
              ref={artInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void pickArtwork(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {/* Applies to both upload buttons. Default on: a mark supplied on
                white reads as a pasted white box on any coloured product. */}
            <label className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={knockOutWhite}
                onChange={(e) => setKnockOutWhite(e.target.checked)}
                className="mt-0.5 size-3 accent-[var(--color-primary)]"
              />
              <span>Make white backgrounds transparent on upload</span>
            </label>
          </div>

          {/* ── Which mark to place ───────────────────────────────────
              The company logo is the default, but it is not always the right
              one: a sub-brand, a one-off campaign mark, or simply a newer file
              than the one on the brand settings page. Swapping it here changes
              this design only and leaves the company logo alone. */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Logo</p>
            <div className="flex items-center gap-2">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-brand border border-border/40 bg-white">
                {canvasLogo ? (
                  canvasLogo.kind === 'svg' ? (
                    <div
                      className="size-full p-1 [&>svg]:size-full"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeSvgMarkup(canvasLogo.value),
                      }}
                    />
                  ) : (
                    <img
                      src={canvasLogo.value}
                      alt=""
                      className="size-full object-contain p-1"
                    />
                  )
                ) : (
                  <ImageUp className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-xs text-muted-foreground">
                  {logoOverride
                    ? 'Custom for this design'
                    : brandLogoKind !== 'none'
                      ? 'Company logo'
                      : 'No logo set'}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-1.5 text-[11px]"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={busy || uploadingLogo}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ImageUp className="size-3" />
                    )}
                    {canvasLogo ? 'Replace' : 'Upload'}
                  </Button>
                  {logoOverride && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px] text-muted-foreground"
                      onClick={() => setLogoOverride(null)}
                      disabled={busy || uploadingLogo}
                      title="Go back to the company logo"
                    >
                      <RotateCcw className="size-3" />
                      Reset
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void pickLogo(e.target.files?.[0])
                // Clear it so picking the same file twice still fires.
                e.target.value = ''
              }}
            />
          </div>

          {selected && (
            <SelectedLayerControls
              layer={selected}
              layout={layout}
              onChange={setLayout}
              onCommit={history.commit}
              brandColors={brandColors}
            />
          )}

          {sources.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Templates
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sources.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    onClick={() => setBaseImage(src)}
                    aria-label={`Use image ${i + 1}`}
                    disabled={busy}
                    className={cn(
                      'size-11 overflow-hidden rounded-brand border-2 transition-colors',
                      source === src
                        ? 'border-primary'
                        : 'border-transparent opacity-70 hover:opacity-100',
                    )}
                  >
                    <img src={src} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Saved versions ───────────────────────────────────────
              Saved when someone asks, under a name they choose — an entry per
              edit is a list nobody reads, and undo already covers "I just did
              something silly". A version is the whole set: the photo, the
              layout, the brief and both renders. It comes back as a set,
              because a render restored next to a layout that never made it is
              a mismatch nobody spots until it ships. */}
          {canSave && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <History className="size-3.5" />
                  Saved versions
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-1.5 text-[11px]"
                  onClick={() => {
                    namingSubmitted.current = false
                    setNamingVersion(true)
                  }}
                  disabled={busy || preparing || !canSaveVersion || namingVersion}
                  title={
                    canSaveVersion
                      ? 'Keep this state under a name'
                      : 'Place something or write a brief first'
                  }
                >
                  <Save className="size-3" />
                  Save
                </Button>
              </div>

              {namingVersion && (
                <Input
                  autoFocus
                  placeholder={`Version ${versions.length + 1}`}
                  className="h-7 text-xs"
                  disabled={preparing || createVersion.isPending}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      namingSubmitted.current = true
                      return setNamingVersion(false)
                    }
                    if (e.key !== 'Enter') return
                    const value = e.currentTarget.value.trim()
                    commitVersionName(value || `Version ${versions.length + 1}`)
                  }}
                  onBlur={(e) => {
                    // Clicking away without typing is a change of mind, not a
                    // save — an unnamed version is the thing we just moved off.
                    const value = e.target.value.trim()
                    if (value) commitVersionName(value)
                    else setNamingVersion(false)
                  }}
                />
              )}

              {versions.length === 0 ? (
                !namingVersion && (
                  <p className="text-[11px] text-muted-foreground">
                    Nothing saved yet. Save one to come back to this exact
                    state later.
                  </p>
                )
              ) : (
                <ul className="space-y-1">
                  {versions.map((version) => (
                    <li
                      key={version.id}
                      className="flex items-center gap-1 rounded-brand border border-border/40 p-1 transition-colors hover:border-border"
                    >
                      {renamingId === version.id ? (
                        <Input
                          autoFocus
                          defaultValue={version.label}
                          className="h-7 flex-1 text-xs"
                          onBlur={(e) => {
                            const label = e.target.value.trim()
                            if (label && label !== version.label) {
                              renameVersionMutation.mutate({
                                versionId: version.id,
                                label,
                              })
                            }
                            setRenamingId(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => restoreVersion(version)}
                            disabled={busy}
                            title="Open this version"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            {/* Both pictures, because a version is a set and
                                the photo it was built on is half of what comes
                                back. Showing only the render made restoring a
                                guess about which source you would land on. */}
                            <span className="flex shrink-0 items-center -space-x-2">
                              <img
                                src={version.source}
                                alt=""
                                title="The photo this was designed on"
                                className="size-8 rounded-brand border border-border/40 bg-background object-cover"
                              />
                              <img
                                src={version.photoreal ?? version.flat ?? version.source}
                                alt=""
                                title="What was made from it"
                                className="size-8 rounded-brand border border-border/40 bg-background object-cover"
                              />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs">
                                {version.label}
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                {versionStamps(
                                  version.createdAt,
                                  version.updatedAt,
                                )}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Rename ${version.label}`}
                            onClick={() => setRenamingId(version.id)}
                            className="flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${version.label}`}
                            onClick={() =>
                              deleteVersionMutation.mutate(version.id)
                            }
                            className="flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <X className="size-3" />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {versions.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Opening one brings back its photo, layout and both renders
                  together.
                </p>
              )}
            </div>
          )}
        </aside>

        {/* ── Centre: the canvas ────────────────────────────────────── */}
        <main className="flex flex-col gap-3 p-4 lg:min-h-0 lg:flex-1">
          {(flat || photoreal) && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {views.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setView(option.id)}
                  disabled={busy}
                  title={option.hint}
                  className={cn(
                    'rounded-brand border px-2.5 py-1 text-xs transition-colors',
                    view === option.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border/40 text-muted-foreground hover:border-border',
                  )}
                >
                  {option.label}
                </button>
              ))}
              {view === 'flat' && !flatIsCurrent && (
                <span className="text-[11px] text-muted-foreground">
                  Confirming rebuilds this from the placement as it stands now.
                </span>
              )}
            </div>
          )}

          {shownImage ? (
            <div className="relative flex min-h-[55vh] items-center justify-center overflow-hidden rounded-brand border border-border/40 bg-muted/20 lg:min-h-0 lg:flex-1">
              <img
                src={shownImage}
                alt="Your design"
                className={cn(
                  'max-h-full max-w-full object-contain transition-opacity',
                  busy && 'opacity-40',
                )}
              />
              {busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70">
                  <BusyOverlay photoreal={customize.isPending} />
                </div>
              )}
            </div>
          ) : (
            <PlacementCanvas
              fit="fill"
              className="min-h-[55vh] lg:min-h-0 lg:flex-1"
              baseImage={source}
              logo={canvasLogo}
              layout={layout}
              onChange={setLayout}
              disabled={busy}
              selectedId={selectedId}
              onSelectedIdChange={setSelectedId}
              showControls={false}
              zoomable
              onCommit={history.commit}
              busy={busy ? <BusyOverlay photoreal={customize.isPending} /> : undefined}
            />
          )}

          <p className="shrink-0 text-center text-xs text-muted-foreground">
            {view === 'flat'
              ? 'The exact mockup — this is what gets printed.'
              : view === 'photoreal'
                ? 'A photoreal presentation of the same design.'
                : placed
                  ? 'Drag to move · corner dot to resize · top dot to rotate · arrow keys nudge'
                  : 'Add your logo or some wording to start placing.'}
          </p>
        </main>

        {/* ── Right: the brief and the controls this subject needs ──── */}
        <aside className="shrink-0 space-y-4 border-t border-border/40 p-4 lg:w-80 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <div className="space-y-1.5">
            <label htmlFor="design-brief" className="text-sm font-medium">
              {isBox ? 'What should we print?' : 'How should it look?'}
            </label>
            {/* The brief needs a visible way out of it.
                A written brief with nothing to press reads as an inert field —
                the only thing that acted on it was a button further down whose
                label talks about renders, not about the words just typed. The
                arrow appears with the first character and does the same thing,
                where the hand already is. ⌘↵ still works for anyone who finds
                it; it is no longer the only way. */}
            <div className="relative">
              <Textarea
                id="design-brief"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  // Plain Enter stays a line break: briefs run to several lines,
                  // and the example chips fill in multi-line text, so submitting
                  // on Enter would make those unusable.
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    if (canGenerate) void generate()
                  }
                }}
                placeholder={examples[0].prompt}
                disabled={busy}
                // Room for the button, so a long brief never runs under it.
                className={cn(prompt.trim() && 'pb-11')}
              />
              {prompt.trim() && (
                <Button
                  type="button"
                  size="sm"
                  aria-label="Render this brief"
                  title="Render this brief"
                  onClick={() => void generate()}
                  disabled={!canGenerate}
                  className="absolute bottom-2 right-2 size-8 rounded-full p-0"
                >
                  {customize.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isBox ? (
                <>
                  Put any wording in quotes — it gets spelled exactly as
                  written.
                  {fullColour
                    ? ' This box prints edge to edge, so name any background colour and it covers the whole box.'
                    : ' The box keeps its own colour; your design prints onto it.'}
                </>
              ) : keepScene ? (
                'Optional. Anything you place stays where you put it — this is only for how the branding itself should look.'
              ) : (
                'Anything you place stays exactly where you put it — this is for the scene around it.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {examples.map((example) => (
              <Button
                key={example.label}
                size="sm"
                variant="outline"
                title={example.prompt}
                onClick={() => setPrompt(example.prompt)}
                disabled={busy}
                className="px-2 py-1 text-xs"
              >
                {example.label}
              </Button>
            ))}
          </div>

          {/* The one place a box and a product genuinely differ. */}
          {isBox ? (
            colors.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Box colour
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {colors.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setColor(color === option ? null : option)}
                      disabled={busy}
                      className={cn(
                        'rounded-brand border px-3 py-1 text-xs capitalize transition-colors',
                        color === option
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border/40 text-muted-foreground hover:border-border',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : canRestage ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Scene
                </span>
                <Select value={sceneType} onValueChange={setSceneType} disabled={busy}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCENE_TYPES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {keepScene
                    ? 'The photo stays as it is — same background, framing and lighting. Only the branding is added.'
                    : 'The product is re-photographed in this scene.'}
                </p>
              </div>
              {/* Only meaningful once a new photograph is being composed —
                  keeping the original means keeping its shape. */}
              {!keepScene && (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Aspect ratio
                  </span>
                  <Select
                    value={aspectRatio}
                    onValueChange={setAspectRatio}
                    disabled={busy}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASPECT_RATIOS.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ) : (
            /* No scene picker here — see `canRestage`. The reassurance it
               carried is still worth saying, though: a shopper placing a mark
               on a photograph wants to know the photograph is staying. */
            <p className="text-xs text-muted-foreground">
              The product photo stays as it is — same background, framing and
              lighting. Only your branding is added.
            </p>
          )}

          {error && (
            <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {/* Two actions, and the one that finishes the job comes first and
              carries the weight. The mockup used to be a third button the
              shopper had to know to press before this one would work; it is
              now a step inside confirming, because it never was a decision. */}
          <div className="space-y-4 border-t border-border/40 pt-4">
            <div className="space-y-1.5">
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={() => void startConfirm()}
                disabled={!canConfirm}
              >
                {preparing || compose.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Preparing your preview…
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    Confirm design
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                {placed
                  ? 'We’ll show you the exact mockup to check before anything is saved.'
                  : 'Describe what you want above, or place your logo on the canvas.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void generate()}
                disabled={!canGenerate}
              >
                {customize.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Rendering…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    {photoreal ? 'Render again' : 'Make it photoreal'}
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Optional · about 15 seconds. A polished photo of the same design
                for presenting — your placement is kept exactly as it is.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Throwing it away ──────────────────────────────────────────
          Discarding now happens in place, so there is no navigation to signal
          that anything went. A placement is real work and only the layout part
          is undoable, so this asks once. */}
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this design?</AlertDialogTitle>
            <AlertDialogDescription>
              The canvas goes back to the plain {product.name} photo. Anything
              you placed, the wording, and both renders are removed.
              {versions.length > 0 &&
                ' Your saved versions are kept — you can open one to bring a design back.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={discardDesign}>
              Discard design
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── The sign-off ──────────────────────────────────────────────
          One deliberate look at the real thing before it becomes an order.
          The picture is the point: the canvas shows a design, this shows the
          artwork that will actually be printed from it. */}
      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(false)
        }}
      >
        <DialogContent className="max-h-[92vh] gap-4 overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirm your design</DialogTitle>
            <DialogDescription>
              {showingRender
                ? `The photoreal render of your design on the ${product.name}. Untick below to check the exact print artwork.`
                : `This is exactly what gets printed on the ${product.name}. Check the placement and the spelling.`}
            </DialogDescription>
          </DialogHeader>

          {chosenImage && (
            <div className="flex items-center justify-center overflow-hidden rounded-brand border border-border/40 bg-muted/20 p-2">
              <img
                src={chosenImage}
                alt="The design you are about to confirm"
                className="max-h-[52vh] w-auto max-w-full object-contain"
              />
            </div>
          )}

          {/* Only a question when there are genuinely two pictures of one
              design. Pre-answered with whichever tab they came from. */}
          {placed && photoreal && (
            <label className="flex items-start gap-2 rounded-brand border border-border/40 p-3 text-xs">
              <input
                type="checkbox"
                checked={useRenderForImage}
                onChange={(e) => setUseRenderForImage(e.target.checked)}
                className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-primary)]"
              />
              <span className="space-y-1">
                <span className="block font-medium">
                  Use the photoreal render
                </span>
                <span className="block text-muted-foreground">
                  Both are saved either way. This changes which one you are
                  looking at, and which one represents the design{' '}
                  {subjectPhrase}
                </span>
              </span>
              <img
                src={showingRender ? (confirmImage ?? photoreal) : photoreal}
                alt=""
                className="size-12 shrink-0 rounded-brand border border-border/40 object-cover"
              />
            </label>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={updateProduct.isPending}
            >
              Keep editing
            </Button>
            <Button
              type="button"
              onClick={() => void approve()}
              disabled={!chosenImage || updateProduct.isPending}
            >
              {updateProduct.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  {approveLabel}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The two waits are an order of magnitude apart — say which one this is. */
function BusyOverlay({ photoreal }: { photoreal: boolean }) {
  return (
    <>
      <Loader2 className="size-7 animate-spin text-primary" />
      <p className="text-sm font-medium">
        {photoreal ? 'Rendering your design…' : 'Building the mockup…'}
      </p>
      <p className="text-xs text-muted-foreground">
        {photoreal ? 'This takes around 15 seconds.' : 'Just a moment.'}
      </p>
    </>
  )
}
