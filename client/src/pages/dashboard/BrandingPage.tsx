import { BrandSettingsForm } from '@/components/brand/BrandSettingsForm'
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Branding</h1>
        <p className="text-sm text-muted-foreground">
          Adjust your brand identity, colors, and typography. Changes preview
          live and apply across the shop.
        </p>
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
