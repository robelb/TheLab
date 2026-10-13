import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const { brand } = useBrand()
  return {
    id: 'preview',
    name: t('dashboard.company.branding.previewProduct.name', {
      company: brand.companyName,
    }),
    tagline: t('dashboard.company.branding.previewProduct.tagline'),
    price: 49,
    currency: 'EUR',
    stock: 12,
    category: t('dashboard.company.branding.previewProduct.category'),
    image: 'https://cdn1.midocean.com/image/700X700/s00553-ce.jpg',
    customizedImage: null,
    description: '',
    details: [],
  }
}

export function BrandingPage() {
  const { t } = useTranslation()
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
      toast.success(t('dashboard.company.branding.savedToast'))
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? t('dashboard.company.branding.saveError')
      toast.error(message)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">
            {t('dashboard.company.branding.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.company.branding.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && !saveBrand.isPending && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5" />
              {t('dashboard.company.branding.saved')}
            </span>
          )}
          <Button
            type="button"
            onClick={() => void save()}
            disabled={!company || saveBrand.isPending}
            title={
              company ? undefined : t('dashboard.company.branding.signInToSave')
            }
          >
            {saveBrand.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('dashboard.company.shared.saving')}
              </>
            ) : (
              <>
                <Save className="size-4" />
                {t('dashboard.company.branding.save')}
              </>
            )}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <BrandSettingsForm />

        <aside className="h-fit space-y-3 lg:sticky lg:top-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t('dashboard.company.branding.livePreview')}
          </p>
          {/* Overlay blocks navigation / add-to-cart — this is a preview only. */}
          <div className="relative max-w-[18rem]">
            <ProductCard product={previewProduct} />
            <div className="absolute inset-0 z-20" aria-hidden />
          </div>
          <p className="text-xs text-muted-foreground">
            {t('dashboard.company.branding.previewHint')}
          </p>
        </aside>
      </div>
    </div>
  )
}
