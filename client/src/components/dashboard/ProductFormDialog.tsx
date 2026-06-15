import { useEffect, useState, type FormEvent } from 'react'
import { ImageManager } from '@/components/dashboard/ImageManager'
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
import type { ProductInput } from '@/types/dashboard'
import type { Product } from '@/types/product'

interface ProductFormDialogProps {
  /** When set, the form edits this product; otherwise it creates a new one. */
  product: Product | null
  open: boolean
  onClose: () => void
}

type Tab = 'details' | 'images'

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
    }

    try {
      if (product) {
        await updateMutation.mutateAsync({ id: product.id, input: payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ??
        (err as Error)?.message ??
        'Something went wrong'
      setError(message)
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
              </div>
            </TabsContent>

            <TabsContent value="images" className="mt-4">
              <ImageManager
                images={form.images}
                onChange={(images) => update('images', images)}
              />
            </TabsContent>
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
