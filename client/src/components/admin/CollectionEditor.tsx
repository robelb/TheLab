import { useEffect, useState } from 'react'
import { AddProductDialog } from '@/components/AddProductDialog'
import { CollectionBoxesTable } from '@/components/admin/CollectionBoxesTable'
import { CollectionProductsTable } from '@/components/admin/CollectionProductsTable'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useSetCollectionProducts,
  useUpdateCollection,
} from '@/hooks/use-collections-admin'
import { apiErrorMessage, notifyError, notifySaved } from '@/lib/notify'
import type { Collection } from '@/api/collections'
import type { Product } from '@/types/product'

/** The server's cap on headline boxes; past it, saving would be refused. */
const MAX_FEATURED = 12

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
  const setMembers = useSetCollectionProducts(collection.id)

  const [tab, setTab] = useState<'content' | 'copy'>('content')
  const [error, setError] = useState<string | null>(null)
  const [pickingBoxes, setPickingBoxes] = useState(false)

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

  // Keyed on the saved ids, not the array: any refetch of the list (ending the
  // campaign, say) hands back a new array with the same boxes, and resetting
  // on that threw away a running order somebody had not saved yet.
  const savedFeaturedKey = (collection.featuredBundleIds ?? []).join(',')
  useEffect(() => {
    setFeatured(collection.featuredBundles ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.id, savedFeaturedKey])

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

  /** Featuring something implies it belongs on the page at all. */
  async function addFeatured(products: Product[]) {
    const room = MAX_FEATURED - featured.length
    const picked = products
      .filter((p) => !featured.some((f) => f.id === p.id))
      .slice(0, Math.max(room, 0))
    if (picked.length === 0) return

    // Tag them first, in one request: if that fails, nothing is listed as a
    // headline box that the page would not actually carry. Tagging one that
    // already has the tag is a no-op on the server.
    try {
      await setMembers.mutateAsync({ add: picked.map((p) => p.id) })
    } catch (err) {
      notifyError(err, 'Could not add those boxes')
      throw err
    }

    setFeatured((prev) => [
      ...prev,
      ...picked.filter((p) => !prev.some((f) => f.id === p.id)),
    ])
    // The running order is saved with the button like the rest of the form.
    notifySaved(
      picked.length === 1
        ? `${picked[0].name} added to the boxes shown first`
        : `${picked.length} boxes added to the boxes shown first`,
      'Save changes to publish the new running order.',
    )
    setPickingBoxes(false)
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

          <CollectionBoxesTable
            boxes={featured}
            max={MAX_FEATURED}
            unsaved={
              featuredIds.join(',') !==
              (collection.featuredBundleIds ?? []).join(',')
            }
            onAdd={() => setPickingBoxes(true)}
            onMove={move}
            onRemove={(box) =>
              setFeatured((prev) => prev.filter((p) => p.id !== box.id))
            }
          />

          <CollectionProductsTable collection={collection} />
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
        open={pickingBoxes}
        onOpenChange={setPickingBoxes}
        existingIds={featuredIds}
        onAddMany={addFeatured}
        maxSelect={MAX_FEATURED - featured.length}
        title="Which boxes should lead this page?"
        kind="bundle"
      />
    </div>
  )
}
