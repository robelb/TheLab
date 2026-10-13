import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatPrice } from '@/utils/format'
import type { Product } from '@/types/product'
import { ProductImage } from '@/components/ProductImage'

/**
 * The boxes a landing page leads with, in the order they appear.
 *
 * Controlled: the editor owns the list and saves every change as it happens.
 * Never more than a dozen rows, so no paging.
 */
export function CollectionBoxesTable({
  boxes,
  max,
  onAdd,
  onMove,
  onRemove,
  saving,
}: {
  boxes: Product[]
  /** A change is being saved; edits wait so they can't race each other. */
  saving?: boolean
  max: number
  onAdd: () => void
  onMove: (index: number, by: number) => void
  onRemove: (product: Product) => void
}) {
  const { t } = useTranslation()
  const full = boxes.length >= max

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">
            {t('dashboard.admin.collectionBoxes.title')}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {boxes.length} / {max}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {full
              ? t('dashboard.admin.collectionBoxes.descriptionFull')
              : t('dashboard.admin.collectionBoxes.description')}
          </p>
          {saving && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('dashboard.admin.common.saving')}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={full || saving}
          onClick={onAdd}
        >
          <Plus className="size-4" />
          {t('dashboard.admin.collectionBoxes.add')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-brand border border-border/40">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>{t('dashboard.admin.collectionBoxes.columns.box')}</TableHead>
              <TableHead>
                {t('dashboard.admin.collectionBoxes.columns.contents')}
              </TableHead>
              <TableHead>{t('dashboard.admin.common.price')}</TableHead>
              <TableHead className="text-right">
                {t('dashboard.admin.collectionBoxes.columns.order')}
              </TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">{t('dashboard.admin.common.remove')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boxes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t('dashboard.admin.collectionBoxes.empty')}
                </TableCell>
              </TableRow>
            ) : (
              boxes.map((box, i) => (
                <TableRow key={box.id}>
                  <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ProductImage
                        src={box.image}
                        alt=""
                        className="size-10 shrink-0 rounded-brand border border-border/40 bg-background object-contain"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{box.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {box.sku}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t('dashboard.admin.collectionBoxes.items', {
                      count: box.components?.length ?? 0,
                    })}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatPrice(box.price, box.currency)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t('dashboard.admin.collectionBoxes.moveUp', {
                          name: box.name,
                        })}
                        disabled={i === 0 || saving}
                        onClick={() => onMove(i, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t('dashboard.admin.collectionBoxes.moveDown', {
                          name: box.name,
                        })}
                        disabled={i === boxes.length - 1 || saving}
                        onClick={() => onMove(i, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={t('dashboard.admin.collectionBoxes.removeAria', {
                          name: box.name,
                        })}
                        disabled={saving}
                        onClick={() => onRemove(box)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
