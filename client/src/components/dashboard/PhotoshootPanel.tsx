import { Check, ImageUp, Plus, Share2, Sparkles, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { usePostHog } from '@posthog/react'
import { ASPECT_RATIOS, SCENE_TYPES, type PhotoshootRequest } from '@/api/photoshoot'
import { createShare, shareUrl, type ShareBrand } from '@/api/share'
import { fileToDataUrl } from '@/api/uploads'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useBrand } from '@/context/BrandContext'
import {
  useProductPhotoshoot,
  useUpdateProduct,
} from '@/hooks/use-product-mutations'
import { resolveLogoKind, sanitizeSvgMarkup } from '@/lib/logo'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/product'

interface PhotoshootPanelProps {
  product: Product
}

interface GenerationResult {
  key: string
  url: string
  sceneLabel: string
  prompt: string
}

/** A compact optional reference-image slot (Image A — style). */
function ReferenceSlot({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (dataUrl: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    onChange(await fileToDataUrl(file))
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {value ? (
        <div className="relative size-16 overflow-hidden rounded-brand border border-border/40">
          <img src={value} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={() => onChange(null)}
            className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex size-16 flex-col items-center justify-center gap-1 rounded-brand border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <ImageUp className="size-4" />
          <span className="text-[10px]">Add</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

/**
 * Branding (Image C) slot. Defaults to the current company logo; the user can
 * upload a different mark to override it for this generation.
 */
function BrandingSlot({
  logo,
  logoKind,
  override,
  onOverride,
}: {
  logo: string | null
  logoKind: ReturnType<typeof resolveLogoKind>
  override: string | null
  onOverride: (dataUrl: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    onOverride(await fileToDataUrl(file))
  }

  const hasDefaultLogo = logoKind !== 'none'
  const caption = override
    ? 'Custom'
    : hasDefaultLogo
      ? 'Company logo'
      : 'No logo set'

  const box = (() => {
    if (override) {
      return (
        <div className="relative size-16 overflow-hidden rounded-brand border border-border/40 bg-white">
          <img src={override} alt="" className="h-full w-full object-contain p-1" />
          <button
            type="button"
            aria-label="Revert to company logo"
            onClick={() => onOverride(null)}
            className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive"
          >
            <X className="size-3" />
          </button>
        </div>
      )
    }

    const defaultPreview =
      logoKind === 'svg' && logo ? (
        <span
          className="flex h-full w-full items-center justify-center p-1.5 [&_svg]:max-h-full [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: sanitizeSvgMarkup(logo) }}
        />
      ) : (logoKind === 'url' || logoKind === 'data-uri') && logo ? (
        <img src={logo} alt="" className="h-full w-full object-contain p-1" />
      ) : (
        <ImageUp className="size-4 text-muted-foreground" />
      )

    return (
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title="Click to upload a custom branding image"
        className={cn(
          'flex size-16 items-center justify-center overflow-hidden rounded-brand border text-muted-foreground transition-colors hover:border-primary/50',
          hasDefaultLogo
            ? 'border-border/40 bg-white'
            : 'border-dashed border-border',
        )}
      >
        {defaultPreview}
      </button>
    )
  })()

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Branding (C)
      </span>
      {box}
      <span className="block text-center text-[10px] text-muted-foreground">
        {caption}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function PhotoshootPanel({ product }: PhotoshootPanelProps) {
  const { brand } = useBrand()
  const posthog = usePostHog()
  const logo = brand.logo ?? null
  const logoKind = resolveLogoKind(brand.logo, brand.logoType)

  const gallery =
    product.images && product.images.length > 0
      ? product.images
      : [product.image]

  const [sceneType, setSceneType] = useState<string>(SCENE_TYPES[0].id)
  const [aspectRatio, setAspectRatio] = useState<string>(ASPECT_RATIOS[0].id)
  const [productImage, setProductImage] = useState<string>(gallery[0])
  const [styleImage, setStyleImage] = useState<string | null>(null)
  const [brandingOverride, setBrandingOverride] = useState<string | null>(null)
  const [promptText, setPromptText] = useState('')
  const [results, setResults] = useState<GenerationResult[]>([])
  const [added, setAdded] = useState<Set<string>>(new Set())
  // Public share links minted per result, plus transient "copied" feedback.
  const [shareSlugs, setShareSlugs] = useState<Record<string, string>>({})
  const [sharingKey, setSharingKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [buildOnLast, setBuildOnLast] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resultsRef = useRef<HTMLDivElement>(null)
  const keyRef = useRef(0)
  const photoshoot = useProductPhotoshoot(product.id)
  const updateProduct = useUpdateProduct()

  const lastResultUrl = results[0]?.url ?? null
  const isRefining = buildOnLast && Boolean(lastResultUrl)

  /** Branding defaults to the company logo unless the user uploads an override. */
  const brandingFields = (): Pick<
    PhotoshootRequest,
    'brandingImage' | 'brandingImageUrl' | 'brandingSvg'
  > => {
    if (brandingOverride) return { brandingImage: brandingOverride }
    if (!logo) return {}
    if (logoKind === 'data-uri') return { brandingImage: logo }
    if (logoKind === 'svg') return { brandingSvg: logo }
    if (logoKind === 'url') return { brandingImageUrl: logo }
    return {}
  }

  const generate = async () => {
    if (generating) return // guard against double-submit
    setError(null)
    setGenerating(true)
    // Show the loading placeholder where the result will land (top of the list).
    resultsRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    try {
      const refine = buildOnLast && Boolean(lastResultUrl)
      const res = await photoshoot.mutateAsync({
        sceneType,
        aspectRatio,
        productImageUrl: productImage,
        prompt: promptText.trim() || undefined,
        // When refining, carry the previous result as the edit base and drop the
        // style image (the prior image already defines the scene).
        baseImageUrl: refine ? lastResultUrl ?? undefined : undefined,
        styleImage: refine ? undefined : styleImage ?? undefined,
        ...brandingFields(),
      })
      const sceneLabel =
        SCENE_TYPES.find((s) => s.id === sceneType)?.label ?? sceneType
      keyRef.current += 1
      setResults((prev) => [
        { key: `gen-${keyRef.current}`, url: res.url, sceneLabel, prompt: res.prompt },
        ...prev,
      ])
      posthog?.capture('product photoshoot generated', {
        product_id: product.id,
        product_name: product.name,
        scene_type: sceneType,
        aspect_ratio: aspectRatio,
        is_refinement: refine,
        has_style_image: Boolean(styleImage),
        has_custom_branding: Boolean(brandingOverride),
        has_prompt: Boolean(promptText.trim()),
      })
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ??
          (err as Error)?.message ??
          'Generation failed',
      )
    } finally {
      // Always clear the loading state, regardless of success or failure.
      setGenerating(false)
    }
  }

  const addToImages = async (url: string) => {
    // Merge with URLs added earlier this session: the `product` prop may not
    // have refetched yet between rapid adds, so building from `gallery` alone
    // could drop a just-added image.
    const next = Array.from(new Set([...gallery, ...added, url]))
    await updateProduct.mutateAsync({
      id: product.id,
      input: { images: next },
    })
    setAdded((prev) => new Set(prev).add(url))
    posthog?.capture('photoshoot image added to product', {
      product_id: product.id,
      product_name: product.name,
    })
  }

  /** Brand snapshot so the public viewer renders our logo/colors, no session. */
  const brandSnapshot = (): ShareBrand => ({
    companyName: brand.companyName,
    logo: logo && logo.length < 180_000 ? logo : null,
    logoType: brand.logoType ?? null,
    primaryColor: brand.primaryColor,
  })

  /** Mint (once) a public share link for a generated result and copy it. */
  const shareResult = async (r: GenerationResult) => {
    setError(null)
    try {
      let slug = shareSlugs[r.key]
      if (!slug) {
        setSharingKey(r.key)
        const res = await createShare({
          imageUrl: r.url,
          productId: product.id,
          title: product.name,
          prompt: r.prompt,
          brand: brandSnapshot(),
        })
        slug = res.slug
        setShareSlugs((prev) => ({ ...prev, [r.key]: slug }))
        posthog?.capture('product design shared', {
          product_id: product.id,
          product_name: product.name,
        })
      }
      await navigator.clipboard?.writeText(shareUrl(slug))
      setCopiedKey(r.key)
      setTimeout(() => setCopiedKey((k) => (k === r.key ? null : k)), 2000)
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ??
          (err as Error)?.message ??
          'Could not create share link',
      )
    } finally {
      setSharingKey(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Conversation / results */}
      <div
        ref={resultsRef}
        className="min-h-48 flex-1 space-y-4 overflow-y-auto p-1"
      >
        {results.length === 0 && !generating && (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-brand border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
            <Sparkles className="size-6 text-primary" />
            <p className="font-medium text-foreground">
              Generate premium product photography
            </p>
            <p className="max-w-xs text-xs">
              Pick a scene and a product image. The company logo is used as
              branding by default — upload a different one to override. Results
              appear here.
            </p>
          </div>
        )}

        {/* Loading placeholder sits at the top, where the new result lands. */}
        {generating && (
          <div className="space-y-2 rounded-brand border border-border/40 bg-card p-3">
            <Badge variant="secondary" className="text-[10px]">
              {isRefining
                ? 'Refining'
                : SCENE_TYPES.find((s) => s.id === sceneType)?.label}
            </Badge>
            <div className="flex aspect-square max-w-[200px] animate-pulse items-center justify-center rounded-brand bg-muted/30 text-center text-sm text-muted-foreground">
              <span className="flex flex-col items-center gap-2 p-3">
                <Sparkles className="size-5 animate-pulse text-primary" />
                Generating…
                <span className="text-[11px]">This can take up to a minute</span>
              </span>
            </div>
          </div>
        )}

        {results.map((r) => {
          const isAdded = added.has(r.url)
          const isSharing = sharingKey === r.key
          const isCopied = copiedKey === r.key
          return (
            <div
              key={r.key}
              className="space-y-2 rounded-brand border border-border/40 bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {r.sceneLabel}
                </Badge>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSharing}
                    onClick={() => shareResult(r)}
                    title="Copy a public link to share this design for sign-off"
                  >
                    {isCopied ? (
                      <>
                        <Check className="size-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Share2 className="size-4" />
                        {isSharing ? 'Sharing…' : 'Share'}
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant={isAdded ? 'outline' : 'default'}
                    disabled={isAdded || updateProduct.isPending}
                    onClick={() => addToImages(r.url)}
                  >
                    {isAdded ? (
                      <>
                        <Check className="size-4" />
                        Added
                      </>
                    ) : (
                      <>
                        <Plus className="size-4" />
                        Add to images
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewUrl(r.url)}
                aria-label="Preview image larger"
                className="block"
              >
                <img
                  src={r.url}
                  alt="Generated product"
                  className="max-w-[200px] cursor-zoom-in rounded-brand border border-border/30 bg-muted/10 object-contain transition-opacity hover:opacity-90"
                />
              </button>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  View prompt
                </summary>
                <p className="mt-1 whitespace-pre-wrap">{r.prompt}</p>
              </details>
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="space-y-3 border-t border-border/40 pt-3 overflow-y-auto h-full">
        {error && (
          <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Scene
              {isRefining ? ' (refining)' : styleImage ? ' (from style)' : ''}
            </span>
            <Select
              value={sceneType}
              onValueChange={setSceneType}
              disabled={Boolean(styleImage) || isRefining}
            >
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
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Aspect ratio
            </span>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
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
        </div>

        {isRefining ? (
          <p className="text-[11px] text-muted-foreground">
            Refining your last result — your instruction is applied while
            keeping the rest of the image.
          </p>
        ) : styleImage ? (
          <p className="text-[11px] text-muted-foreground">
            Using your style image as the scene — the product is placed into it
            and branded.
          </p>
        ) : null}

        <div className="flex items-start gap-3">
          <ReferenceSlot
            label="Style (A)"
            value={styleImage}
            onChange={setStyleImage}
          />
          <BrandingSlot
            logo={logo}
            logoKind={logoKind}
            override={brandingOverride}
            onOverride={setBrandingOverride}
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Product image (B)
          </span>
          <div className="flex flex-wrap gap-2">
            {gallery.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => setProductImage(src)}
                aria-label={`Use product image ${i + 1}`}
                className={cn(
                  'size-12 overflow-hidden rounded-brand border-2 transition-colors',
                  productImage === src
                    ? 'border-primary'
                    : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <Textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          rows={2}
          placeholder={
            isRefining
              ? "Describe the change (e.g. 'make the background darker', 'bigger logo')"
              : "Optional: extra direction (e.g. 'on a marble surface, morning light')"
          }
        />

        {results.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={buildOnLast}
              onCheckedChange={(c) => setBuildOnLast(c === true)}
            />
            <span>Build on last result (refine it instead of starting fresh)</span>
          </label>
        )}

        <Button
          className="w-full"
          onClick={generate}
          disabled={generating || !productImage}
        >
          <Sparkles className="size-4" />
          {generating
            ? 'Generating…'
            : isRefining
              ? 'Refine image'
              : 'Generate image'}
        </Button>
      </div>

      {/* Larger preview of a generated image. */}
      <Dialog
        open={previewUrl !== null}
        onOpenChange={(open) => !open && setPreviewUrl(null)}
      >
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">Generated image preview</DialogTitle>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Generated product preview"
              className="max-h-[85vh] w-full rounded-brand object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
