import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
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
 * Controlled: the running order is part of the form and saved with its button,
 * so the list lives with the editor. Never more than a dozen rows, so no paging.
 */
export function CollectionBoxesTable({
  boxes,
  max,
  onAdd,
  onMove,
  onRemove,
  unsaved,
}: {
  boxes: Product[]
  /** The order differs from what is published; it goes out with Save. */
  unsaved?: boolean
  max: number
  onAdd: () => void
  onMove: (index: number, by: number) => void
  onRemove: (product: Product) => void
}) {
  const full = boxes.length >= max

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">
            Boxes shown first
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {boxes.length} / {max}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            The offers at the top of the page, in this order.
            {full && ' That is the most a page can lead with.'}
          </p>
          {unsaved && (
            <p className="mt-1 text-xs font-medium text-primary">
              Unsaved — press “Save changes” below to publish these boxes.
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={full}
          onClick={onAdd}
        >
          <Plus className="size-4" />
          Add boxes
        </Button>
      </div>

      <div className="overflow-hidden rounded-brand border border-border/40">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Box</TableHead>
              <TableHead>Contents</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="text-right">Order</TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">Remove</span>
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
                  No boxes yet — the page will show only the products below.
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
                    {box.components?.length ?? 0} items
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
                        aria-label={`Move ${box.name} up`}
                        disabled={i === 0}
                        onClick={() => onMove(i, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Move ${box.name} down`}
                        disabled={i === boxes.length - 1}
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
                        aria-label={`Remove ${box.name}`}
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
