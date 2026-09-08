import { useState } from 'react'
import { Check, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { BrandSettingsForm } from '@/components/brand/BrandSettingsForm'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useUpdateCompanyBrand } from '@/hooks/use-companies'
import { brandConfigToExtraction } from '@/lib/mapExtractionToBrand'
import { ProductCard } from '@/components/ProductCard'
import { useBrand } from '@/context/BrandContext'
import type { Product } from '@/types/product'

/** A stand-in product so the card reflects brand colors, fonts, and radius. */
function usePreviewProduct(): Product {
  const { brand } = useBrand()
  return {
    id: 'preview',
    name: `${brand.companyName} Tee`,
    tagline: 'Live brand preview',
    price: 49,
    currency: 'EUR',
    stock: 12,
    category: 'Preview',
    image: 'https://cdn1.midocean.com/image/700X700/s00553-ce.jpg',
    customizedImage: null,
    description: '',
    details: [],
  }
}

export function BrandingPage() {
  const previewProduct = usePreviewProduct()
  const { brand } = useBrand()
  const { company } = useAuth()
  const saveBrand = useUpdateCompanyBrand()
  const [savedAt, setSavedAt] = useState<number | null>(null)

  /**
   * Until this existed, the form edited a copy in this browser and nothing
   * else. The next page load re-applied the company's stored brand over the
   * top, so the work vanished — and teammates never saw any of it.
   */
  async function save() {
    if (!company) return
    try {
      await saveBrand.mutateAsync({
        id: company.id,
        brand: brandConfigToExtraction(brand),
      })
      setSavedAt(Date.now())
      toast.success('Branding saved for everyone at your company')
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? 'Could not save your branding'
      toast.error(message)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Branding</h1>
          <p className="text-sm text-muted-foreground">
            Adjust your brand identity, colors, and typography. Changes preview
            live here — save to apply them across the shop for everyone.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && !saveBrand.isPending && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5" />
              Saved
            </span>
          )}
          <Button
            type="button"
            onClick={() => void save()}
            disabled={!company || saveBrand.isPending}
            title={company ? undefined : 'Sign in with a company account to save'}
          >
            {saveBrand.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="size-4" />
                Save branding
              </>
            )}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <BrandSettingsForm />

        <aside className="h-fit space-y-3 lg:sticky lg:top-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Live preview
          </p>
          {/* Overlay blocks navigation / add-to-cart — this is a preview only. */}
          <div className="relative max-w-[18rem]">
            <ProductCard product={previewProduct} />
            <div className="absolute inset-0 z-20" aria-hidden />
          </div>
          <p className="text-xs text-muted-foreground">
            A sample card rendered with your current brand theme.
          </p>
        </aside>
      </div>
    </div>
  )
}
