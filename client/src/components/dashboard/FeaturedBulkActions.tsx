import { Loader2, Star, StarOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useSetProductsFeatured } from '@/hooks/use-product-mutations'
import { notifyError, notifySaved } from '@/lib/notify'

/**
 * The bar that appears once rows are ticked: feature them, unfeature them, or
 * let go of the selection. Shared by the products table and the featured page.
 */
export function FeaturedBulkActions({
  selected,
  onDone,
  show = 'both',
}: {
  selected: Set<string>
  /** Called after a successful update — the caller clears its selection. */
  onDone: () => void
  /** The featured page only ever needs one direction per tab. */
  show?: 'both' | 'feature' | 'unfeature'
}) {
  const { t } = useTranslation()
  const mutation = useSetProductsFeatured()
  if (selected.size === 0) return null

  const count = selected.size
  const pendingFlag = mutation.isPending ? mutation.variables?.isFeatured : null

  async function apply(isFeatured: boolean) {
    try {
      const { updated } = await mutation.mutateAsync({
        ids: [...selected],
        isFeatured,
      })
      notifySaved(
        isFeatured
          ? t('dashboard.products.featured.featuredToast', { count: updated.length })
          : t('dashboard.products.featured.unfeaturedToast', { count: updated.length }),
      )
      onDone()
    } catch (err) {
      notifyError(
        err,
        isFeatured
          ? t('dashboard.products.featured.featureFailed', { count })
          : t('dashboard.products.featured.unfeatureFailed', { count }),
      )
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-brand border border-border/40 bg-muted/30 px-2 py-1">
      <span className="text-sm">
        {t('dashboard.products.featured.selected', { count })}
      </span>
      {show !== 'unfeature' && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={mutation.isPending}
          onClick={() => void apply(true)}
        >
          {pendingFlag === true ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Star className="size-4" />
          )}
          {t('dashboard.products.featured.markFeatured')}
        </Button>
      )}
      {show !== 'feature' && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={mutation.isPending}
          onClick={() => void apply(false)}
        >
          {pendingFlag === false ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <StarOff className="size-4" />
          )}
          {t('dashboard.products.featured.unfeature')}
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={mutation.isPending}
        onClick={onDone}
      >
        {t('dashboard.products.featured.clear')}
      </Button>
    </div>
  )
}
