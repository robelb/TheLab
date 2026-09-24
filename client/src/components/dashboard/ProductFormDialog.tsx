import { useEffect, useState } from 'react'
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
import { FieldMessage, FormAlert, FormField } from '@/components/ui/form-field'
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
import { useZodForm, type FormErrors } from '@/lib/form'
import { productSchema } from '@/lib/schemas/dashboard'
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

/** The tab a field lives on — where a failed save has to take you. */
function tabOf(field: string): Tab {
  if (field === 'images') return 'images'
  if (field === 'contents') return 'contents'
  return 'details'
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
  const f = useZodForm({ schema: productSchema, initialValues: EMPTY })
  const form = f.values
  const { reset } = f
  const [error, setError] = useState<string | null>(null)

  // Reset the form whenever the dialog opens for a different product.
  useEffect(() => {
    if (!open) return
    setError(null)
    setTab('details')
    if (product) {
      const matched = categories.find((c) => c.name === product.category)
      reset({
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
      reset(EMPTY)
    }
  }, [open, product, categories, reset])

  const update = f.set
  /** Which tabs have something to fix, for the dot on their label. */
  const tabsWithErrors = new Set(Object.keys(f.errors).map(tabOf))

  /** Runs only once the schema has passed — see `useZodForm`. */
  const save = async () => {
    setError(null)

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

        <form
          onSubmit={f.handleSubmit(save, (errors: FormErrors) => {
            // Open the tab the first problem is on, so it can be seen.
            const first = Object.keys(errors)[0]
            if (first) setTab(tabOf(first))
          })}
          className="space-y-5"
          noValidate
        >
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="details" className={brandTabClass}>
                Details
                <ErrorDot show={tabsWithErrors.has('details')} />
              </TabsTrigger>
              <TabsTrigger value="images" className={brandTabClass}>
                Images{form.images.length > 0 && ` (${form.images.length})`}
                <ErrorDot show={tabsWithErrors.has('images')} />
              </TabsTrigger>
              {/* Only a pre-configured box has anything inside it. */}
              {form.isBundle && (
                <TabsTrigger value="contents" className={brandTabClass}>
                  Box contents
                  {form.contents.items.length > 0 &&
                    ` (${form.contents.items.length})`}
                  <ErrorDot show={tabsWithErrors.has('contents')} />
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="name" label="Name" error={f.errors.name} className="sm:col-span-2">
                  <Input {...f.register('name')} />
                </FormField>

                <FormField
                  id="tagline"
                  label="Tagline"
                  error={f.errors.tagline}
                  optional
                  className="sm:col-span-2"
                >
                  <Input {...f.register('tagline')} />
                </FormField>

                <FormField id="price" label="Price" error={f.errors.price} hint="Net, before VAT.">
                  <Input {...f.register('price')} type="number" min="0" step="0.01" inputMode="decimal" />
                </FormField>

                <FormField id="currency" label="Currency" error={f.errors.currency}>
                  <Input {...f.register('currency')} maxLength={3} placeholder="EUR" />
                </FormField>

                <FormField id="stock" label="Stock" error={f.errors.stock}>
                  <Input {...f.register('stock')} type="number" min="0" step="1" inputMode="numeric" />
                </FormField>

                <FormField id="categoryId" label="Category" error={f.errors.categoryId}>
                  <Select
                    value={form.categoryId}
                    onValueChange={(v) => update('categoryId', v)}
                  >
                    <SelectTrigger
                      id="categoryId"
                      className="w-full"
                      aria-invalid={f.errors.categoryId ? true : undefined}
                      aria-describedby={f.errors.categoryId ? 'categoryId-error' : undefined}
                    >
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
                </FormField>

                <FormField
                  id="description"
                  label="Description"
                  error={f.errors.description}
                  optional
                  className="sm:col-span-2"
                >
                  <Textarea {...f.register('description')} rows={3} />
                </FormField>

                <FormField
                  id="details"
                  label="Details"
                  error={f.errors.details}
                  hint="One per line."
                  optional
                  className="sm:col-span-2"
                >
                  <Textarea {...f.register('details')} rows={3} />
                </FormField>

                <FormField
                  id="sku"
                  label="SKU"
                  error={f.errors.sku}
                  hint="Generated for you if left blank."
                  optional
                >
                  <Input {...f.register('sku')} />
                </FormField>

                <FormField
                  id="minQuantity"
                  label="Minimum order"
                  error={f.errors.minQuantity}
                  hint="The fewest a customer can order."
                >
                  <Input {...f.register('minQuantity')} type="number" min="1" step="1" inputMode="numeric" />
                </FormField>

                {/* What a landing page filters on. Free text rather than a
                    fixed list: marketing invents an occasion long before
                    anybody gets round to adding it to a menu. */}
                <FormField
                  id="tags"
                  label="Occasions"
                  error={f.errors.tags}
                  hint="Comma separated. A collection page shows everything carrying its occasion."
                  optional
                  className="sm:col-span-2"
                >
                  <Input {...f.register('tags')} placeholder="christmas, welcome" />
                </FormField>

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

            <TabsContent value="images" className="mt-4 space-y-3">
              {/* Focusable, so a failed save can bring the cursor here. */}
              <div id="images" tabIndex={-1} className="outline-none">
                <FieldMessage id="images" error={f.errors.images} />
              </div>
              <ImageManager
                images={form.images}
                onChange={(images) => update('images', images)}
              />
            </TabsContent>

            {form.isBundle && (
              <TabsContent value="contents" className="mt-4 space-y-3">
                <div id="contents" tabIndex={-1} className="outline-none">
                  <FieldMessage id="contents" error={f.errors.contents} />
                </div>
                <BundleContentsEditor
                  value={form.contents}
                  onChange={(contents) => update('contents', contents)}
                  bundlePrice={Number(form.price) || 0}
                  currency={form.currency || 'EUR'}
                />
              </TabsContent>
            )}
          </Tabs>

          {f.errorCount > 0 ? (
            <FormAlert>
              {f.errorCount === 1
                ? 'One thing to fix before saving. It is marked above.'
                : `${f.errorCount} things to fix before saving. They are marked above.`}
            </FormAlert>
          ) : (
            <FormAlert>{error}</FormAlert>
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

/** A small red dot on a tab that has something to fix. */
function ErrorDot({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span
      className="ml-1.5 inline-block size-1.5 rounded-full bg-destructive"
      aria-label="has errors"
    />
  )
}
