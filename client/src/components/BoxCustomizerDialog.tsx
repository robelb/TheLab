import { AlertTriangle, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useBrand } from '@/context/BrandContext'
import { useCustomizeBox } from '@/hooks/use-products'
import { boxColorOptions, isFullColourBox } from '@/lib/box'
import { resolveLogoKind } from '@/lib/logo'
import { getProductDisplayImage } from '@/lib/productImage'
import { cn } from '@/lib/utils'
import type { CustomizeBoxRequest } from '@/api/products'
import type { Product } from '@/types/product'

interface BoxCustomizerDialogProps {
  box: Product | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The design currently applied to this box, if any. */
  currentImage?: string | null
  onApply: (image: string, prompt: string) => void
  onClear: () => void
}

/**
 * Starting points, not decoration — each shows a different way to brief the
 * box: a stated occasion, a design direction with no wording, and exact
 * quoted copy. Short enough to read as a chip, complete enough to run as-is.
 */
const EXAMPLES = [
  {
    label: 'Welcome box',
    prompt:
      'A calm welcome-aboard design for a new starter: the big little things logo centred on the lid, a thin accent line beneath it, and plenty of empty space. Nothing else.',
  },
  {
    label: 'Festive',
    prompt:
      'A festive design with small hand-drawn fir trees scattered across the lid and "Merry Christmas" set beneath them in a warm script.',
  },
  {
    label: 'Thank you',
    prompt:
      'Print "THANK YOU" in a bold uppercase sans-serif, centred on the lid, in a single accent colour with the BLT logo small underneath it.',
  },
  {
    label: 'Birthday',
    prompt:
      'A cheerful birthday design: confetti dots in mixed colours around the edge of the lid and "Happy Birthday" in a friendly script in the middle.',
  },
]

/**
 * Ask for a design in plain words and render the chosen gift box with it
 * printed on. The box's own catalogue copy (dimensions, material, which faces
 * take a print) is sent along server-side, so the model prints onto the real
 * box rather than inventing packaging.
 */
export function BoxCustomizerDialog({
  box,
  open,
  onOpenChange,
  currentImage,
  onApply,
  onClear,
}: BoxCustomizerDialogProps) {
  const { brand } = useBrand()
  const [prompt, setPrompt] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [withLogo, setWithLogo] = useState(false)
  // Toggling the logo is itself a request for a new render — without this the
  // shopper is forced to retype a prompt just to add or drop the logo.
  const [logoTouched, setLogoTouched] = useState(false)
  // Successive tweaks build on the last render instead of starting over.
  const [refine, setRefine] = useState(true)
  const [result, setResult] = useState<string | null>(null)

  const customize = useCustomizeBox(box?.id)
  // A full-colour box has no fixed stock colour — the whole box is printed, so
  // the shopper names the colour instead of picking a board.
  const fullColour = isFullColourBox(box?.name, box?.description)
  const colors = fullColour ? [] : boxColorOptions(box?.description)
  const logoKind = resolveLogoKind(brand.logo, brand.logoType)
  const hasLogo = logoKind !== 'none'

  // Reset per box — a design belongs to the box it was printed on.
  useEffect(() => {
    if (!open) return
    setPrompt('')
    setResult(currentImage ?? null)
    setColor(null)
    setWithLogo(false)
    setLogoTouched(false)
    customize.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, box?.id])

  const brandingFields = (): Pick<
    CustomizeBoxRequest,
    'brandingImage' | 'brandingImageUrl' | 'brandingSvg'
  > => {
    if (!withLogo || !brand.logo) return {}
    if (logoKind === 'data-uri') return { brandingImage: brand.logo }
    if (logoKind === 'svg') return { brandingSvg: brand.logo }
    if (logoKind === 'url') return { brandingImageUrl: brand.logo }
    return {}
  }

  // A render needs something to act on: wording, the logo, or an existing
  // design to change. Toggling the logo alone is enough.
  const canGenerate =
    Boolean(prompt.trim() || withLogo || (logoTouched && result)) &&
    !customize.isPending

  const generate = async () => {
    if (!canGenerate) return
    const res = await customize.mutateAsync({
      prompt: prompt.trim(),
      ...(color ? { color } : {}),
      ...(refine && result ? { baseImageUrl: result } : {}),
      ...brandingFields(),
    })
    setResult(res.url)
  }

  const error = customize.error
    ? ((customize.error as { response?: { data?: { error?: string } } }).response
        ?.data?.error ??
      (customize.error as Error).message)
    : null

  const preview = result ?? (box ? getProductDisplayImage(box) : null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-4 text-primary" />
            Customise {box?.name}
          </DialogTitle>
          <DialogDescription>
            Describe the print you want. We render it onto this exact box —
            same size, same material, same construction.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ── Preview ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div
              className="relative overflow-hidden rounded-brand border border-border/40 bg-muted/20"
              aria-busy={customize.isPending}
            >
              {preview && (
                <img
                  src={preview}
                  alt={result ? 'Customised box' : box?.name}
                  className={cn(
                    'aspect-square w-full object-contain transition-opacity',
                    customize.isPending && 'opacity-40',
                  )}
                />
              )}
              {customize.isPending && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 px-6 text-center">
                  <Loader2 className="size-7 animate-spin text-primary" />
                  <p className="text-sm font-medium">Printing your box…</p>
                  <p className="text-xs text-muted-foreground">
                    This takes around 15 seconds.
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {result
                ? 'Generated design — apply it, or keep tweaking.'
                : 'The plain box. Describe a print to get started.'}
            </p>
          </div>

          {/* ── Controls ────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="box-print" className="text-sm font-medium">
                What should we print?
              </label>
              <Textarea
                id="box-print"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={EXAMPLES[0].prompt}
                disabled={customize.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Put any wording in quotes — it gets spelled exactly as written.
                {fullColour
                  ? ' This box prints edge to edge, so name any background colour and it covers the whole box.'
                  : ' The box keeps its own colour; your design prints onto it.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <Button size='sm' variant="outline" key={example.label} title={example.prompt} onClick={() => setPrompt(example.prompt)} disabled={customize.isPaused} className='py-1 px-2 text-xs' >{example.label}</Button>
              ))}
            </div>

            {colors.length > 0 && (
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
                      disabled={customize.isPending}
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
            )}

            {hasLogo && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={withLogo}
                  onCheckedChange={(v) => {
                    setWithLogo(v === true)
                    setLogoTouched(true)
                  }}
                  disabled={customize.isPending}
                />
                Include Your Logo
              </label>
            )}

            {result && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={refine}
                  onCheckedChange={(v) => setRefine(v === true)}
                  disabled={customize.isPending}
                />
                <span>
                  Build on the current design
                  <span className="block text-xs text-muted-foreground">
                    Off to start again from the plain box.
                  </span>
                </span>
              </label>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <Button
              type="button"
              className="w-full"
              onClick={() => void generate()}
              disabled={!canGenerate}
            >
              {customize.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Printing…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  {result ? 'Generate again' : 'Generate design'}
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border/40 pt-4">
          {currentImage && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-muted-foreground"
              onClick={() => {
                onClear()
                onOpenChange(false)
              }}
              disabled={customize.isPending}
            >
              Remove design
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={customize.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!result) return
              onApply(result, prompt.trim())
              onOpenChange(false)
            }}
            disabled={!result || result === currentImage || customize.isPending}
          >
            Use this design
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
