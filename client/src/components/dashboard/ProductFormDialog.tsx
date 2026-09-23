import { useEffect, useState, type FormEvent } from 'react'
import { ImageManager } from '@/components/dashboard/ImageManager'
import {
  BundleContentsEditor,
  type BundleContentsValue,
} from '@/components/dashboard/BundleContentsEditor'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useCategories } from '@/hooks/use-dashboard'
import {
  useCreateProduct,
  useUpdateProduct,
} from '@/hooks/use-product-mutations'
import { apiErrorMessage, notifyError, notifySaved } from '@/lib/notify'
import type { ProductComponentInput, ProductInput } from '@/types/dashboard'
import type { Product } from '@/types/product'

interface ProductFormDialogProps {
  /** When set, the form edits this product; otherwise it creates a new one. */
  product: Product | null
  open: boolean
  onClose: () => void
}

type Tab = 'details' | 'images' | 'contents'

// Active tab adopts the company's brand color (the --primary token is set from
// the extracted brand palette), so the editor matches the themed shop.
const brandTabClass =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm'

interface FormState {
  name: string
  tagline: string
  price: string
  currency: string
  stock: string
  categoryId: string
  images: string[]
  description: string
  details: string
  isFeatured: boolean
  sku: string
  /** A pre-configured box, rather than an ordinary catalogue item. */
  isBundle: boolean
  /** Occasion slugs, comma-separated in the field, e.g. `christmas, welcome`. */
  tags: string
  minQuantity: string
  contents: BundleContentsValue
}

const EMPTY_CONTENTS: BundleContentsValue = {
  items: [],
  packagingId: null,
  fillingId: null,
}

const EMPTY: FormState = {
  name: '',
  tagline: '',
  price: '',
  currency: 'EUR',
  stock: '0',
  categoryId: '',
  images: [],
  description: '',
  details: '',
  isFeatured: false,
  sku: '',
  isBundle: false,
  tags: '',
  minQuantity: '1',
  contents: EMPTY_CONTENTS,
}

/** The editor's shape for what a bundle already holds. */
function contentsOf(product: Product): BundleContentsValue {
  const components = product.components ?? []
  return {
    items: components
      .filter((c) => c.role === 'item')
      .map((c) => ({
        productId: c.product.id,
        name: c.product.name,
        price: c.product.price,
        currency: c.product.currency,
        image: c.product.image,
        quantity: c.quantity,
      })),
    packagingId:
      components.find((c) => c.role === 'packaging')?.product.id ?? null,
    fillingId: components.find((c) => c.role === 'filling')?.product.id ?? null,
  }
}

/** Gallery for an existing product, falling back to its single cover image. */
function galleryOf(product: Product): string[] {
  if (product.images && product.images.length > 0) return product.images
  return product.image ? [product.image] : []
}

export function ProductFormDialog({
  product,
  open,
  onClose,
}: ProductFormDialogProps) {
  const { data: categories = [] } = useCategories()
  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct()
  const isEditing = Boolean(product)
  const mutation = isEditing ? updateMutation : createMutation

  const [tab, setTab] = useState<Tab>('details')
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  // Reset the form whenever the dialog opens for a different product.
  useEffect(() => {
    if (!open) return
    setError(null)
    setTab('details')
    if (product) {
      const matched = categories.find((c) => c.name === product.category)
      setForm({
        name: product.name,
        tagline: product.tagline ?? '',
        price: String(product.price),
        currency: product.currency ?? 'EUR',
        stock: String(product.stock ?? 0),
        categoryId: matched?.id ?? '',
        images: galleryOf(product),
        description: product.description ?? '',
        details: (product.details ?? []).join('\n'),
        isFeatured: Boolean(product.isFeatured),
        sku: product.sku ?? '',
        isBundle: product.kind === 'bundle',
        tags: (product.tags ?? []).join(', '),
        minQuantity: String(product.minQuantity ?? 1),
        contents: contentsOf(product),
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, product, categories])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setTab('details')
      setError('Name is required')
      return
    }
    if (form.price === '' || Number.isNaN(Number(form.price))) {
      setTab('details')
      setError('A valid price is required')
      return
    }
    if (!form.categoryId) {
      setTab('details')
      setError('Please choose a category')
      return
    }
    if (form.images.length === 0) {
      setTab('images')
      setError('Add at least one image')
      return
    }

    if (form.isBundle && form.contents.items.length === 0) {
      setTab('contents')
      setError('A box needs at least one product in it')
      return
    }

    // Sent only for a bundle. An ordinary product has no parts list, and
    // sending an empty one would wipe the contents of anything converted back.
    const components: ProductComponentInput[] | undefined = form.isBundle
      ? [
          ...form.contents.items.map((item, i) => ({
            componentId: item.productId,
            quantity: item.quantity,
            role: 'item' as const,
            sortOrder: i,
          })),
          ...(form.contents.packagingId
            ? [
                {
                  componentId: form.contents.packagingId,
                  quantity: 1,
                  role: 'packaging' as const,
                  sortOrder: 90,
                },
              ]
            : []),
          ...(form.contents.fillingId
            ? [
                {
                  componentId: form.contents.fillingId,
                  quantity: 1,
                  role: 'filling' as const,
                  sortOrder: 91,
                },
              ]
            : []),
        ]
      : undefined

    const payload: ProductInput = {
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      price: Number(form.price),
      currency: form.currency.trim() || 'EUR',
      stock: Number(form.stock),
      categoryId: form.categoryId,
      image: form.images[0],
      images: form.images,
      description: form.description.trim(),
      details: form.details
        .split('\n')
        .map((d) => d.trim())
        .filter(Boolean),
      isFeatured: form.isFeatured,
      sku: form.sku.trim() || undefined,
      kind: form.isBundle ? 'bundle' : 'single',
      tags: form.tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      minQuantity: Math.max(1, Number(form.minQuantity) || 1),
      ...(components ? { components } : {}),
    }

    try {
      if (product) {
        await updateMutation.mutateAsync({ id: product.id, input: payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      onClose()
      notifySaved(
        product ? `${payload.name} saved` : `${payload.name} added`,
        form.isBundle
          ? `Pre-configured box · ${form.contents.items.length} product${form.contents.items.length === 1 ? '' : 's'} inside`
          : undefined,
      )
    } catch (err) {
      const message = apiErrorMessage(err, 'Something went wrong')
      // Kept inline as well: the dialog stays open on a failure, and the
      // message usually names the field that has to change.
      setError(message)
      notifyError(err, 'Something went wrong')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit product' : 'New product'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update product details and manage its images.'
              : 'Add a new product to your catalog.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="details" className={brandTabClass}>
                Details
              </TabsTrigger>
              <TabsTrigger value="images" className={brandTabClass}>
                Images{form.images.length > 0 && ` (${form.images.length})`}
              </TabsTrigger>
              {/* Only a pre-configured box has anything inside it. */}
              {form.isBundle && (
                <TabsTrigger value="contents" className={brandTabClass}>
                  Box contents
                  {form.contents.items.length > 0 &&
                    ` (${form.contents.items.length})`}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="tagline">Tagline</Label>
                  <Input
                    id="tagline"
                    value={form.tagline}
                    onChange={(e) => update('tagline', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="price">Price</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => update('price', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    value={form.currency}
                    onChange={(e) => update('currency', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="stock">Stock</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock}
                    onChange={(e) => update('stock', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={form.categoryId}
                    onValueChange={(v) => update('categoryId', v)}
                  >
                    <SelectTrigger id="category" className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    rows={3}
                    value={form.description}
                    onChange={(e) => update('description', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="details">Details (one per line)</Label>
                  <Textarea
                    id="details"
                    rows={3}
                    value={form.details}
                    onChange={(e) => update('details', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sku">SKU (optional)</Label>
                  <Input
                    id="sku"
                    value={form.sku}
                    onChange={(e) => update('sku', e.target.value)}
                    placeholder="Auto-generated if blank"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="minQuantity">Minimum order</Label>
                  <Input
                    id="minQuantity"
                    type="number"
                    min="1"
                    step="1"
                    value={form.minQuantity}
                    onChange={(e) => update('minQuantity', e.target.value)}
                  />
                </div>

                {/* What a landing page filters on. Free text rather than a
                    fixed list: marketing invents an occasion long before
                    anybody gets round to adding it to a menu. */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="tags">Occasions (comma separated)</Label>
                  <Input
                    id="tags"
                    value={form.tags}
                    onChange={(e) => update('tags', e.target.value)}
                    placeholder="christmas, welcome"
                  />
                  <p className="text-xs text-muted-foreground">
                    A collection page shows everything carrying its occasion.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end pb-2">
                  <Checkbox
                    id="featured"
                    checked={form.isFeatured}
                    onCheckedChange={(c) => update('isFeatured', c === true)}
                  />
                  <Label htmlFor="featured" className="font-medium">
                    Featured product
                  </Label>
                </div>

                {/* Turning this on gives the product a parts list and a price
                    of its own — the two things that make it a box rather than
                    an item. */}
                <div className="flex items-center gap-2 self-end pb-2">
                  <Checkbox
                    id="isBundle"
                    checked={form.isBundle}
                    onCheckedChange={(c) => {
                      const on = c === true
                      update('isBundle', on)
                      if (on) setTab('contents')
                    }}
                  />
                  <Label htmlFor="isBundle" className="font-medium">
                    Pre-configured box
                  </Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="images" className="mt-4">
              <ImageManager
                images={form.images}
                onChange={(images) => update('images', images)}
              />
            </TabsContent>

            {form.isBundle && (
              <TabsContent value="contents" className="mt-4">
                <BundleContentsEditor
                  value={form.contents}
                  onChange={(contents) => update('contents', contents)}
                  bundlePrice={Number(form.price) || 0}
                  currency={form.currency || 'EUR'}
                />
              </TabsContent>
            )}
          </Tabs>

          {error && (
            <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? 'Saving…'
                : isEditing
                  ? 'Save changes'
                  : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
