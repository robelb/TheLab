import { useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { AddProductDialog } from '@/components/AddProductDialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBoxSupplies } from '@/hooks/use-products'
import { formatPrice } from '@/utils/format'
import type { Product } from '@/types/product'

/** An item in the box, with enough of the product to show and price it. */
export interface BundleItemDraft {
  productId: string
  name: string
  price: number
  currency?: string
  image: string
  quantity: number
}

export interface BundleContentsValue {
  items: BundleItemDraft[]
  packagingId: string | null
  fillingId: string | null
}

interface BundleContentsEditorProps {
  value: BundleContentsValue
  onChange: (next: BundleContentsValue) => void
  /** The price this box is sold at, so the discount is visible while setting it. */
  bundlePrice: number
  currency: string
}

/**
 * What a pre-configured box holds.
 *
 * The same three choices the shopper makes in the builder — products, a box,
 * something to pack around them — because a bundle is exactly a box somebody
 * built once and priced. It shows the parts total next to the sticker price:
 * those two numbers are deliberately different, and the person setting the
 * price is the one who needs to see by how much.
 */
export function BundleContentsEditor({
  value,
  onChange,
  bundlePrice,
  currency,
}: BundleContentsEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { supplies, isLoading } = useBoxSupplies()

  const packaging =
    supplies.packaging.find((p) => p.id === value.packagingId) ?? null
  const filling = supplies.filling.find((p) => p.id === value.fillingId) ?? null

  const partsTotal =
    value.items.reduce((sum, i) => sum + i.price * i.quantity, 0) +
    (packaging?.price ?? 0) +
    (filling?.price ?? 0)

  const addProduct = (product: Product) => {
    if (value.items.some((i) => i.productId === product.id)) return
    onChange({
      ...value,
      items: [
        ...value.items,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          currency: product.currency,
          image: product.image,
          quantity: 1,
        },
      ],
    })
  }

  const setQuantity = (productId: string, quantity: number) =>
    onChange({
      ...value,
      items: value.items.map((i) =>
        i.productId === productId ? { ...i, quantity: Math.max(1, quantity) } : i,
      ),
    })

  const removeProduct = (productId: string) =>
    onChange({
      ...value,
      items: value.items.filter((i) => i.productId !== productId),
    })

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Products in the box</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="size-4" />
            Add product
          </Button>
        </div>

        {value.items.length === 0 ? (
          <p className="rounded-brand border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing in this box yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/40 rounded-brand border border-border/40">
            {value.items.map((item) => (
              <li
                key={item.productId}
                className="flex items-center gap-3 p-2.5"
              >
                <img
                  src={item.image}
                  alt=""
                  className="size-10 shrink-0 rounded-brand border border-border/40 bg-background object-contain"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.name}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatPrice(item.price, item.currency)}
                  </p>
                </div>
                <div className="flex items-center rounded-brand border border-border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-none"
                    aria-label="Fewer"
                    onClick={() => setQuantity(item.productId, item.quantity - 1)}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="min-w-7 text-center text-sm tabular-nums">
                    {item.quantity}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-none"
                    aria-label="More"
                    onClick={() => setQuantity(item.productId, item.quantity + 1)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => removeProduct(item.productId)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The box and the filling are charged like anything else in it, which is
          why they are chosen here rather than assumed. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="bundle-packaging">Box</Label>
          <Select
            value={value.packagingId ?? ''}
            onValueChange={(v) => onChange({ ...value, packagingId: v })}
            disabled={isLoading}
          >
            <SelectTrigger id="bundle-packaging" className="w-full">
              <SelectValue placeholder="Choose a box" />
            </SelectTrigger>
            <SelectContent>
              {supplies.packaging.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {formatPrice(p.price, p.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bundle-filling">Filling</Label>
          <Select
            value={value.fillingId ?? ''}
            onValueChange={(v) => onChange({ ...value, fillingId: v })}
            disabled={isLoading}
          >
            <SelectTrigger id="bundle-filling" className="w-full">
              <SelectValue placeholder="Choose filling" />
            </SelectTrigger>
            <SelectContent>
              {supplies.filling.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {formatPrice(p.price, p.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <dl className="space-y-1 rounded-brand border border-border/40 bg-muted/10 p-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Parts add up to</dt>
          <dd className="tabular-nums">{formatPrice(partsTotal, currency)}</dd>
        </div>
        <div className="flex justify-between font-medium">
          <dt>Sold for</dt>
          <dd className="tabular-nums">{formatPrice(bundlePrice, currency)}</dd>
        </div>
        {partsTotal > 0 && bundlePrice > 0 && (
          <p className="pt-1 text-xs text-muted-foreground">
            {bundlePrice < partsTotal
              ? `Customers save ${formatPrice(partsTotal - bundlePrice, currency)} against buying the parts.`
              : `This box costs ${formatPrice(bundlePrice - partsTotal, currency)} more than its parts.`}{' '}
            Change anything inside it and it is priced per item instead.
          </p>
        )}
      </dl>

      <AddProductDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        existingIds={value.items.map((i) => i.productId)}
        onAdd={(product) => {
          addProduct(product)
          setPickerOpen(false)
        }}
        title="Add to this box"
        plainImages
        kind="single"
        bestSellersFirst
      />
    </div>
  )
}
