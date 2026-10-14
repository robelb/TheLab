import { Check, ImageUp, Plus, Share2, Sparkles, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  /** Scene id, worded at render time so it follows the language. */
  sceneType: string
  prompt: string
}

/** A scene's name in the current language, falling back to the API's English. */
function useSceneLabel() {
  const { t } = useTranslation()
  return (id: string) =>
    t(`dashboard.products.photoshoot.scenes.${id}`, {
      defaultValue: SCENE_TYPES.find((s) => s.id === id)?.label ?? id,
    })
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
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    onChange(await fileToDataUrl(file))
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {value ? (
        <div className="relative size-16 overflow-hidden rounded-brand border border-border">
          <img src={value} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            aria-label={t('dashboard.products.photoshoot.removeSlot', { label })}
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
          className="flex size-16 flex-col items-center justify-center gap-1 rounded-brand border border-dashed border-border-strong text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <ImageUp className="size-4" />
          <span className="text-[10px]">{t('dashboard.products.photoshoot.add')}</span>
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
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    onOverride(await fileToDataUrl(file))
  }

  const hasDefaultLogo = logoKind !== 'none'
  const caption = override
    ? t('dashboard.products.photoshoot.brandingCustom')
    : hasDefaultLogo
      ? t('dashboard.products.photoshoot.brandingCompanyLogo')
      : t('dashboard.products.photoshoot.brandingNoLogo')

  const box = (() => {
    if (override) {
      return (
        <div className="relative size-16 overflow-hidden rounded-brand border border-border bg-white">
          <img src={override} alt="" className="h-full w-full object-contain p-1" />
          <button
            type="button"
            aria-label={t('dashboard.products.photoshoot.revertLogo')}
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
        title={t('dashboard.products.photoshoot.uploadBrandingTitle')}
        className={cn(
          'flex size-16 items-center justify-center overflow-hidden rounded-brand border text-muted-foreground transition-colors hover:border-primary/50',
          hasDefaultLogo
            ? 'border-border bg-white'
            : 'border-dashed border-border-strong',
        )}
      >
        {defaultPreview}
      </button>
    )
  })()

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {t('dashboard.products.photoshoot.branding')}
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
  const { t } = useTranslation()
  const sceneLabel = useSceneLabel()
  const { brand } = useBrand()
  const posthog = usePostHog()
  const logo = brand.logo ?? null
  const logoKind = resolveLogoKind(brand.logo, brand.logoType)

  const gallery =
    product.images && product.images.length > 0
      ? product.images
      : [product.image]

  const [sceneType, setSceneType] = useState<string>('studio-hero')
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
      keyRef.current += 1
      setResults((prev) => [
        { key: `gen-${keyRef.current}`, url: res.url, sceneType, prompt: res.prompt },
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
          t('dashboard.products.photoshoot.generationFailed'),
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
          t('dashboard.products.photoshoot.shareFailed'),
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
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-brand border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <Sparkles className="size-6 text-primary" />
            <p className="font-medium text-foreground">
              {t('dashboard.products.photoshoot.emptyTitle')}
            </p>
            <p className="max-w-xs text-xs">
              {t('dashboard.products.photoshoot.emptyBody')}
            </p>
          </div>
        )}

        {/* Loading placeholder sits at the top, where the new result lands. */}
        {generating && (
          <div className="space-y-2 rounded-brand border border-border bg-card p-3">
            <Badge variant="secondary" className="text-[10px]">
              {isRefining
                ? t('dashboard.products.photoshoot.refining')
                : sceneLabel(sceneType)}
            </Badge>
            <div className="flex aspect-square max-w-[200px] animate-pulse items-center justify-center rounded-brand bg-muted text-center text-sm text-muted-foreground">
              <span className="flex flex-col items-center gap-2 p-3">
                <Sparkles className="size-5 animate-pulse text-primary" />
                {t('dashboard.products.photoshoot.generating')}
                <span className="text-[11px]">
                  {t('dashboard.products.photoshoot.generatingHint')}
                </span>
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
              className="space-y-2 rounded-brand border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {sceneLabel(r.sceneType)}
                </Badge>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSharing}
                    onClick={() => shareResult(r)}
                    title={t('dashboard.products.photoshoot.shareTitle')}
                  >
                    {isCopied ? (
                      <>
                        <Check className="size-4" />
                        {t('dashboard.products.copied')}
                      </>
                    ) : (
                      <>
                        <Share2 className="size-4" />
                        {isSharing
                          ? t('dashboard.products.sharing')
                          : t('dashboard.products.share')}
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
                        {t('dashboard.products.photoshoot.added')}
                      </>
                    ) : (
                      <>
                        <Plus className="size-4" />
                        {t('dashboard.products.photoshoot.addToImages')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewUrl(r.url)}
                aria-label={t('dashboard.products.photoshoot.previewLarger')}
                className="block"
              >
                <img
                  src={r.url}
                  alt={t('dashboard.products.photoshoot.generatedAlt')}
                  className="max-w-[200px] cursor-zoom-in rounded-brand border border-border bg-muted object-contain transition-opacity hover:opacity-90"
                />
              </button>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  {t('dashboard.products.photoshoot.viewPrompt')}
                </summary>
                <p className="mt-1 whitespace-pre-wrap">{r.prompt}</p>
              </details>
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="space-y-3 border-t border-border pt-3 overflow-y-auto h-full">
        {error && (
          <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {isRefining
                ? t('dashboard.products.photoshoot.sceneRefining')
                : styleImage
                  ? t('dashboard.products.photoshoot.sceneFromStyle')
                  : t('dashboard.products.photoshoot.scene')}
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
                    {sceneLabel(s.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t('dashboard.products.photoshoot.aspectRatio')}
            </span>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {t(`dashboard.products.photoshoot.aspectRatios.${r.id}`, {
                      defaultValue: r.label,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isRefining ? (
          <p className="text-[11px] text-muted-foreground">
            {t('dashboard.products.photoshoot.refiningHint')}
          </p>
        ) : styleImage ? (
          <p className="text-[11px] text-muted-foreground">
            {t('dashboard.products.photoshoot.styleHint')}
          </p>
        ) : null}

        <div className="flex items-start gap-3">
          <ReferenceSlot
            label={t('dashboard.products.photoshoot.style')}
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
            {t('dashboard.products.photoshoot.productImage')}
          </span>
          <div className="flex flex-wrap gap-2">
            {gallery.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => setProductImage(src)}
                aria-label={t('dashboard.products.photoshoot.useProductImage', { number: i + 1 })}
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
              ? t('dashboard.products.photoshoot.refinePlaceholder')
              : t('dashboard.products.photoshoot.promptPlaceholder')
          }
        />

        {results.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={buildOnLast}
              onCheckedChange={(c) => setBuildOnLast(c === true)}
            />
            <span>{t('dashboard.products.photoshoot.buildOnLast')}</span>
          </label>
        )}

        <Button
          className="w-full"
          onClick={generate}
          disabled={generating || !productImage}
        >
          <Sparkles className="size-4" />
          {generating
            ? t('dashboard.products.photoshoot.generating')
            : isRefining
              ? t('dashboard.products.photoshoot.refineImage')
              : t('dashboard.products.photoshoot.generateImage')}
        </Button>
      </div>

      {/* Larger preview of a generated image. */}
      <Dialog
        open={previewUrl !== null}
        onOpenChange={(open) => !open && setPreviewUrl(null)}
      >
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">
            {t('dashboard.products.photoshoot.previewTitle')}
          </DialogTitle>
          {previewUrl && (
            <img
              src={previewUrl}
              alt={t('dashboard.products.photoshoot.previewAlt')}
              className="max-h-[85vh] w-full rounded-brand object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
