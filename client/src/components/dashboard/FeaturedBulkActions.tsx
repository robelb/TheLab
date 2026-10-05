import { Loader2, Star, StarOff } from 'lucide-react'
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
  const mutation = useSetProductsFeatured()
  if (selected.size === 0) return null

  const count = selected.size
  const label = count === 1 ? '1 product' : `${count} products`
  const pendingFlag = mutation.isPending ? mutation.variables?.isFeatured : null

  async function apply(isFeatured: boolean) {
    try {
      const { updated } = await mutation.mutateAsync({
        ids: [...selected],
        isFeatured,
      })
      const done =
        updated.length === 1 ? '1 product' : `${updated.length} products`
      notifySaved(isFeatured ? `${done} featured` : `${done} unfeatured`)
      onDone()
    } catch (err) {
      notifyError(
        err,
        isFeatured ? `Could not feature ${label}` : `Could not unfeature ${label}`,
      )
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-brand border border-border/40 bg-muted/30 px-2 py-1">
      <span className="text-sm">{count} selected</span>
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
          Mark featured
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
          Unfeature
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={mutation.isPending}
        onClick={onDone}
      >
        Clear
      </Button>
    </div>
  )
}
