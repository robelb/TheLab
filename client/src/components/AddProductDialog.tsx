import { useTranslation } from 'react-i18next'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/use-debounce'
import { useProducts } from '@/hooks/use-products'
import { getProductDisplayImage } from '@/lib/productImage'
import type { Product } from '@/types/product'

interface AddProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Already picked — filtered out of the results. */
  existingIds: string[]
  onAdd: (product: Product) => void
  title?: string
  /**
   * Show plain catalogue photos rather than the company's branded variants —
   * for the box builder, where these products are about to be designed. See
   * `CampaignProductTile`.
   */
  plainImages?: boolean
}

/**
 * Searchable product picker. Shared by the dashboard campaign editor and the
 * storefront box builder.
 */
export function AddProductDialog({
  open,
  onOpenChange,
  existingIds,
  onAdd,
  title,
  plainImages,
}: AddProductDialogProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const q = useDebounce(search, 400)
  const { data, isFetching } = useProducts({ page: 1, limit: 20, q })
  const products = (data?.data ?? []).filter((p) => !existingIds.includes(p.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? t('buildBox.addAProduct')}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('buildBox.searchProducts')}
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {isFetching && products.length === 0 && (
            <Skeleton className="h-12 w-full" />
          )}
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onAdd(p)}
              className="flex w-full items-center gap-3 rounded-brand p-2 text-left transition-colors hover:bg-muted/40"
            >
              <img
                src={plainImages ? p.image : getProductDisplayImage(p)}
                alt=""
                className="size-10 shrink-0 rounded-brand border border-border/40 object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <Plus className="size-4 text-primary" />
            </button>
          ))}
          {!isFetching && products.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('buildBox.noProductsFound')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
