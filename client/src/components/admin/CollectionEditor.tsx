import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Star, Trash2, X } from 'lucide-react'
import { AddProductDialog } from '@/components/AddProductDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useCollectionProducts,
  useSetCollectionProducts,
  useUpdateCollection,
} from '@/hooks/use-collections-admin'
import { apiErrorMessage, notifyError, notifySaved } from '@/lib/notify'
import { formatPrice } from '@/utils/format'
import type { Collection } from '@/api/collections'
import type { Product } from '@/types/product'

const brandTabClass =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm'

/**
 * Everything a landing page shows, in the order somebody sets it up.
 *
 * The page around this owns the campaign's identity — its address, whether it
 * is live, and deleting it. This owns what is on it: the boxes that lead, the
 * products underneath, whether a visitor may build their own, and the copy.
 */
export function CollectionEditor({ collection }: { collection: Collection }) {
  const updateCollection = useUpdateCollection()
  const membersQuery = useCollectionProducts(collection.id)
  const setMembers = useSetCollectionProducts(collection.id)

  const [tab, setTab] = useState<'content' | 'copy'>('content')
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<'featured' | 'member' | null>(null)

  // The headline boxes, held locally so they can be reordered before saving.
  const [featured, setFeatured] = useState<Product[]>(
    collection.featuredBundles ?? [],
  )
  const [titleDe, setTitleDe] = useState(collection.title.de)
  const [titleEn, setTitleEn] = useState(collection.title.en)
  const [subtitleDe, setSubtitleDe] = useState(collection.subtitle?.de ?? '')
  const [subtitleEn, setSubtitleEn] = useState(collection.subtitle?.en ?? '')
  const [locale, setLocale] = useState<'de' | 'en'>(
    collection.defaultLocale === 'en' ? 'en' : 'de',
  )
  const [allowCustomization, setAllowCustomization] = useState(
    collection.allowCustomization,
  )

  useEffect(() => {
    setFeatured(collection.featuredBundles ?? [])
  }, [collection.id, collection.featuredBundles])

  const members = membersQuery.data ?? []
  const featuredIds = featured.map((p) => p.id)
  const dirty =
    titleDe !== collection.title.de ||
    titleEn !== collection.title.en ||
    subtitleDe !== (collection.subtitle?.de ?? '') ||
    subtitleEn !== (collection.subtitle?.en ?? '') ||
    locale !== collection.defaultLocale ||
    allowCustomization !== collection.allowCustomization ||
    featuredIds.join(',') !== (collection.featuredBundleIds ?? []).join(',')

  function move(index: number, by: number) {
    const next = [...featured]
    const target = index + by
    if (target < 0 || target >= next.length) return
    const held = next[index]
    next[index] = next[target]
    next[target] = held
    setFeatured(next)
  }

  async function save() {
    setError(null)
    try {
      await updateCollection.mutateAsync({
        id: collection.id,
        input: {
          title: { de: titleDe.trim(), en: titleEn.trim() || titleDe.trim() },
          subtitle:
            subtitleDe.trim() || subtitleEn.trim()
              ? { de: subtitleDe.trim(), en: subtitleEn.trim() }
              : null,
          featuredBundleIds: featuredIds,
          defaultLocale: locale,
          allowCustomization,
        },
      })
      // Says what the page will now do, not just that a row was written —
      // the customisation switch changes the shape of the page, and that is
      // the part worth confirming.
      notifySaved(
        `/c/${collection.slug} saved`,
        allowCustomization
          ? `${featuredIds.length || 'No'} box${featuredIds.length === 1 ? '' : 'es'} shown first · visitors can build their own`
          : `${featuredIds.length || 'No'} box${featuredIds.length === 1 ? '' : 'es'} shown first · buy only`,
      )
    } catch (err) {
      const message = apiErrorMessage(err, 'Could not save this page')
      setError(message)
      notifyError(err, 'Could not save this page')
    }
  }

  /**
   * Membership saves on the spot, unlike the rest of this form, so each change
   * says so — otherwise adding a product and pressing nothing feels unsaved.
   */
  function addMember(product: Product) {
    setMembers.mutate(
      { add: [product.id] },
      {
        onSuccess: () =>
          notifySaved(`${product.name} added to /c/${collection.slug}`),
        onError: (err) => notifyError(err, `Could not add ${product.name}`),
      },
    )
  }

  function removeMember(product: Product) {
    setMembers.mutate(
      { remove: [product.id] },
      {
        onSuccess: () =>
          notifySaved(`${product.name} removed from /c/${collection.slug}`),
        onError: (err) => notifyError(err, `Could not remove ${product.name}`),
      },
    )
  }

  /** Featuring something implies it belongs on the page at all. */
  function addFeatured(product: Product) {
    setFeatured((prev) =>
      prev.some((p) => p.id === product.id) ? prev : [...prev, product],
    )
    if (!members.some((m) => m.id === product.id)) {
      addMember(product)
    } else {
      // Already on the page; only the running order changed, and that is saved
      // with the button like the rest of the form.
      notifySaved(`${product.name} moved to the top of the page`, 'Save to apply')
    }
    setPicking(null)
  }

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'content' | 'copy')}>
        <TabsList>
          <TabsTrigger value="content" className={brandTabClass}>
            What is on the page
          </TabsTrigger>
          <TabsTrigger value="copy" className={brandTabClass}>
            Headline &amp; language
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="mt-4 space-y-6">
          {/* First, because it decides whether half of this page applies. */}
          <section className="flex items-start gap-3 rounded-brand border border-border/40 bg-muted/10 p-3">
            <Checkbox
              id={`custom-${collection.id}`}
              checked={allowCustomization}
              onCheckedChange={(c) => setAllowCustomization(c === true)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label
                htmlFor={`custom-${collection.id}`}
                className="font-medium"
              >
                Let visitors build and brand their own box
              </Label>
              <p className="text-xs text-muted-foreground">
                {allowCustomization
                  ? 'The page offers the box builder and a “customise” button on every box.'
                  : 'Buy only — no builder, no customise buttons, and no design editor for anything reached from this page.'}
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label className="flex items-center gap-1.5">
                  <Star className="size-4 text-primary" />
                  Boxes shown first
                </Label>
                <p className="text-xs text-muted-foreground">
                  The offers at the top of the page, in this order.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPicking('featured')}
              >
                <Plus className="size-4" />
                Add a box
              </Button>
            </div>

            {featured.length === 0 ? (
              <p className="rounded-brand border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                No boxes yet — the page will show only the products below.
              </p>
            ) : (
              <ul className="divide-y divide-border/40 rounded-brand border border-border/40">
                {featured.map((product, i) => (
                  <li key={product.id} className="flex items-center gap-3 p-2.5">
                    <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <img
                      src={product.image}
                      alt=""
                      className="size-10 shrink-0 rounded-brand border border-border/40 bg-background object-contain"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{product.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatPrice(product.price, product.currency)}
                        {product.kind === 'bundle' &&
                          ` · ${product.components?.length ?? 0} items`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Move down"
                      disabled={i === featured.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      aria-label={`Remove ${product.name}`}
                      onClick={() =>
                        setFeatured((prev) =>
                          prev.filter((p) => p.id !== product.id),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label>Everything else on the page</Label>
                <p className="text-xs text-muted-foreground">
                  Shown under the offers, and what a shopper can put in a box of
                  their own. Saved the moment you add or remove one.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={setMembers.isPending}
                onClick={() => setPicking('member')}
              >
                {setMembers.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add products
              </Button>
            </div>

            {membersQuery.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <p className="rounded-brand border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing in this collection yet.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {members.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center gap-2 rounded-brand border border-border/40 bg-background/60 py-1 pl-1 pr-1.5"
                  >
                    <img
                      src={product.image}
                      alt=""
                      className="size-7 shrink-0 rounded-brand bg-background object-contain"
                      loading="lazy"
                    />
                    <span className="max-w-52 truncate text-xs">
                      {product.name}
                    </span>
                    {product.kind === 'bundle' && (
                      <Badge variant="secondary" className="px-1 text-[0.65rem]">
                        Box
                      </Badge>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${product.name} from this collection`}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      onClick={() => removeMember(product)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="copy" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`title-de-${collection.id}`}>
                Headline (German)
              </Label>
              <Input
                id={`title-de-${collection.id}`}
                value={titleDe}
                onChange={(e) => setTitleDe(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`title-en-${collection.id}`}>
                Headline (English)
              </Label>
              <Input
                id={`title-en-${collection.id}`}
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="Falls back to the German one"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`sub-de-${collection.id}`}>
                Subheading (German)
              </Label>
              <Input
                id={`sub-de-${collection.id}`}
                value={subtitleDe}
                onChange={(e) => setSubtitleDe(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`sub-en-${collection.id}`}>
                Subheading (English)
              </Label>
              <Input
                id={`sub-en-${collection.id}`}
                value={subtitleEn}
                onChange={(e) => setSubtitleEn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`locale-${collection.id}`}>
                Language visitors get
              </Label>
              <Select
                value={locale}
                onValueChange={(v) => setLocale(v as 'de' | 'en')}
              >
                <SelectTrigger id={`locale-${collection.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Unless the link ends in ?lang=…
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {error && (
        <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-border/40 pt-3">
        <Button
          type="button"
          disabled={!dirty || updateCollection.isPending}
          onClick={save}
        >
          {updateCollection.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        {dirty && (
          <span className="text-xs text-muted-foreground">
            Unsaved changes to the headline boxes or copy.
          </span>
        )}
      </div>

      <AddProductDialog
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        existingIds={
          picking === 'featured' ? featuredIds : members.map((m) => m.id)
        }
        onAdd={(product) => {
          if (picking === 'featured') {
            addFeatured(product)
          } else {
            addMember(product)
            setPicking(null)
          }
        }}
        title={
          picking === 'featured'
            ? 'Which box should lead this page?'
            : 'Add to this collection'
        }
        kind={picking === 'featured' ? 'bundle' : undefined}
      />
    </div>
  )
}
