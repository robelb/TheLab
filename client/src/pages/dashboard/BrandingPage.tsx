import { useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { resetHouseTheme, saveHouseTheme } from '@/api/theme'
import { BrandSettingsForm } from '@/components/brand/BrandSettingsForm'
import { themeKeys } from '@/components/ThemeSync'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/context/AuthContext'
import { useUpdateCompanyBrand } from '@/hooks/use-companies'
import {
  brandConfigToExtraction,
  mapExtractionToBrand,
} from '@/lib/mapExtractionToBrand'
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

/** Which theme the page edits: big little things' own, or the company's. */
type Scope = 'house' | 'company'

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } }).response?.data
      ?.error ?? fallback
  )
}

export function BrandingPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const previewProduct = usePreviewProduct()
  const {
    brand,
    setEditingHouse,
    applyHouseTheme,
    applyExtractedBrand,
    resetBrand,
  } = useBrand()
  const { company, can } = useAuth()
  const saveBrand = useUpdateCompanyBrand()
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Only an administrator edits the house theme, and that is what they come
  // here for first; a company owner only ever has their own.
  const canEditHouse = can('manage_all')
  const [scope, setScope] = useState<Scope>(canEditHouse ? 'house' : 'company')
  const editingHouse = canEditHouse && scope === 'house'
  const [houseSaving, setHouseSaving] = useState(false)
  const saving = editingHouse ? houseSaving : saveBrand.isPending

  // Before paint, so the form never shows one theme's values under the other.
  useLayoutEffect(() => {
    setEditingHouse(editingHouse)
    return () => setEditingHouse(false)
  }, [editingHouse, setEditingHouse])

  function switchScope(next: Scope) {
    setScope(next)
    setSavedAt(null)
  }

  async function saveHouse() {
    setHouseSaving(true)
    try {
      applyHouseTheme(await saveHouseTheme(brand))
      // The draft is the theme now, so drop it.
      resetBrand()
      void queryClient.invalidateQueries({ queryKey: themeKeys.all })
      setSavedAt(Date.now())
      toast.success(t('dashboard.company.branding.houseSavedToast'))
    } catch (err) {
      toast.error(errorMessage(err, t('dashboard.company.branding.saveError')))
    } finally {
      setHouseSaving(false)
    }
  }

  async function resetHouse() {
    if (!window.confirm(t('dashboard.company.branding.resetHouseConfirm'))) {
      return
    }
    setHouseSaving(true)
    try {
      await resetHouseTheme()
      applyHouseTheme(null)
      resetBrand()
      void queryClient.invalidateQueries({ queryKey: themeKeys.all })
      setSavedAt(null)
      toast.success(t('dashboard.company.branding.resetHouseToast'))
    } catch (err) {
      toast.error(errorMessage(err, t('dashboard.company.branding.saveError')))
    } finally {
      setHouseSaving(false)
    }
  }

  /**
   * Until this existed, the form edited a copy in this browser and nothing
   * else. The next page load re-applied the company's stored brand over the
   * top, so the work vanished — and teammates never saw any of it.
   */
  async function save() {
    if (editingHouse) return saveHouse()
    if (!company) return
    try {
      const saved = await saveBrand.mutateAsync({
        id: company.id,
        brand: brandConfigToExtraction(brand),
      })
      // What was saved becomes the theme, and the draft goes with it — which
      // also lets ThemeSync pick up the next change from anybody else.
      if (saved.brand) applyExtractedBrand(mapExtractionToBrand(saved.brand))
      void queryClient.invalidateQueries({ queryKey: themeKeys.all })
      setSavedAt(Date.now())
      toast.success(t('dashboard.company.branding.savedToast'))
    } catch (err) {
      toast.error(errorMessage(err, t('dashboard.company.branding.saveError')))
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
            {editingHouse
              ? t('dashboard.company.branding.houseSubtitle')
              : t('dashboard.company.branding.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && !saving && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5" />
              {t('dashboard.company.branding.saved')}
            </span>
          )}
          {editingHouse && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void resetHouse()}
              disabled={saving}
            >
              <RotateCcw className="size-4" />
              {t('dashboard.company.branding.resetHouse')}
            </Button>
          )}
          <Button
            type="button"
            onClick={() => void save()}
            disabled={(!editingHouse && !company) || saving}
            title={
              editingHouse || company
                ? undefined
                : t('dashboard.company.branding.signInToSave')
            }
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('dashboard.company.shared.saving')}
              </>
            ) : (
              <>
                <Save className="size-4" />
                {editingHouse
                  ? t('dashboard.company.branding.saveHouse')
                  : t('dashboard.company.branding.save')}
              </>
            )}
          </Button>
        </div>
      </header>

      {canEditHouse && company && (
        <Tabs value={scope} onValueChange={(v) => switchScope(v as Scope)}>
          <TabsList aria-label={t('dashboard.company.branding.scopeLabel')}>
            <TabsTrigger value="house">
              {t('dashboard.company.branding.scopeHouse')}
            </TabsTrigger>
            <TabsTrigger value="company">
              {t('dashboard.company.branding.scopeCompany')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

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
