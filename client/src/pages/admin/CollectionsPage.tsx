import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { Copy, ExternalLink, Trash2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  useAllCollections,
  useCreateCollection,
  useDeleteCollection,
  useUpdateCollection,
} from '@/hooks/use-collections-admin'
import { useProducts } from '@/hooks/use-products'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

/**
 * The landing pages the ads point at.
 *
 * One of these is what a paid click arrives on: a headline, up to a few boxes
 * to buy outright, and a tag that decides which of the catalogue shows up
 * underneath. Marketing changes these mid-campaign, which is why they are rows
 * rather than code.
 */
export function CollectionsPage() {
  const { can } = useAuth()
  const collectionsQuery = useAllCollections()
  const createCollection = useCreateCollection()
  const updateCollection = useUpdateCollection()
  const removeCollection = useDeleteCollection()

  // Only pre-configured boxes can be a headline offer.
  const bundlesQuery = useProducts({ page: 1, limit: 60, kind: 'bundle' })
  const bundles = useMemo(() => bundlesQuery.data?.data ?? [], [bundlesQuery.data])

  const [slug, setSlug] = useState('')
  const [tag, setTag] = useState('')
  const [titleDe, setTitleDe] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [subtitleDe, setSubtitleDe] = useState('')
  const [subtitleEn, setSubtitleEn] = useState('')
  const [locale, setLocale] = useState<'de' | 'en'>('de')
  const [featured, setFeatured] = useState<string[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  if (!can('manage_all')) return <Navigate to="/dashboard" replace />

  const collections = collectionsQuery.data ?? []

  function toggleFeatured(id: string) {
    setFeatured((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    try {
      await createCollection.mutateAsync({
        slug: slug.trim().toLowerCase(),
        tag: tag.trim().toLowerCase(),
        title: { de: titleDe.trim(), en: titleEn.trim() || titleDe.trim() },
        subtitle:
          subtitleDe.trim() || subtitleEn.trim()
            ? { de: subtitleDe.trim(), en: subtitleEn.trim() }
            : null,
        featuredBundleIds: featured,
        defaultLocale: locale,
        active: true,
        sortOrder: 0,
      })
      setSlug('')
      setTag('')
      setTitleDe('')
      setTitleEn('')
      setSubtitleDe('')
      setSubtitleEn('')
      setFeatured([])
    } catch (err) {
      setFormError(
        err instanceof AxiosError
          ? (err.response?.data?.error ?? 'Could not create the collection')
          : 'Could not create the collection',
      )
    }
  }

  /** The link marketing puts on the landing page, ready to paste. */
  function linkFor(collectionSlug: string, defaultLocale: string): string {
    return `${window.location.origin}/c/${collectionSlug}?lang=${defaultLocale}`
  }

  async function copyLink(collectionSlug: string, defaultLocale: string) {
    try {
      await navigator.clipboard.writeText(linkFor(collectionSlug, defaultLocale))
      setCopied(collectionSlug)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      /* Clipboard blocked — the link is on screen to copy by hand. */
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Landing collections</h1>
        <p className="text-sm text-muted-foreground">
          Each one is a page an ad can point at. Hand the link to the agency and
          add the campaign parameters to the end of it.
        </p>
      </div>

      {collectionsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <p className="rounded-brand border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
          No collections yet. Create the first one below.
        </p>
      ) : (
        <ul className="space-y-3">
          {collections.map((collection) => (
            <li key={collection.id}>
              <Card className="border-border/30">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      /c/{collection.slug}
                      <Badge variant="outline" className="uppercase">
                        {collection.defaultLocale}
                      </Badge>
                      <Badge variant="secondary">#{collection.tag}</Badge>
                      {!collection.active && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Ended
                        </Badge>
                      )}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {collection.title.de}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copyLink(collection.slug, collection.defaultLocale)
                      }
                    >
                      <Copy className="size-4" />
                      {copied === collection.slug ? 'Copied' : 'Copy link'}
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <a
                        href={`/c/${collection.slug}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="size-4" />
                        Open
                      </a>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="break-all rounded-brand bg-muted/40 px-3 py-2 font-mono text-xs">
                    {linkFor(collection.slug, collection.defaultLocale)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {collection.featuredBundles.length > 0
                      ? `Boxes: ${collection.featuredBundles.map((b) => b.name).join(', ')}`
                      : 'No boxes featured — the page shows only the filtered catalogue.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={updateCollection.isPending}
                      onClick={() =>
                        updateCollection.mutate({
                          id: collection.id,
                          input: { active: !collection.active },
                        })
                      }
                    >
                      {collection.active ? 'End campaign' : 'Reopen'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      disabled={removeCollection.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete /c/${collection.slug}? Any ad pointing at it will land on a "no longer available" page.`,
                          )
                        ) {
                          removeCollection.mutate(collection.id)
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="border-border/30">
        <CardHeader>
          <CardTitle>New collection</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="slug">URL segment</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="weihnachten"
                required
              />
              <p className="text-xs text-muted-foreground">
                The page will be at /c/{slug.trim().toLowerCase() || '…'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tag">Occasion tag</Label>
              <Input
                id="tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="christmas"
                required
              />
              <p className="text-xs text-muted-foreground">
                Products carrying this tag fill the page.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="titleDe">Headline (German)</Label>
              <Input
                id="titleDe"
                value={titleDe}
                onChange={(e) => setTitleDe(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="titleEn">Headline (English)</Label>
              <Input
                id="titleEn"
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="Falls back to the German one"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subtitleDe">Subheading (German)</Label>
              <Input
                id="subtitleDe"
                value={subtitleDe}
                onChange={(e) => setSubtitleDe(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subtitleEn">Subheading (English)</Label>
              <Input
                id="subtitleEn"
                value={subtitleEn}
                onChange={(e) => setSubtitleEn(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="locale">Language visitors get</Label>
              <Select
                value={locale}
                onValueChange={(v) => setLocale(v as 'de' | 'en')}
              >
                <SelectTrigger id="locale" className="w-full">
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

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Boxes shown first</Label>
              {bundles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No pre-configured boxes yet. Make one in Products by ticking
                  “Pre-configured box”.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {bundles.map((bundle) => (
                    <li key={bundle.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`bundle-${bundle.id}`}
                        checked={featured.includes(bundle.id)}
                        onCheckedChange={() => toggleFeatured(bundle.id)}
                      />
                      <Label
                        htmlFor={`bundle-${bundle.id}`}
                        className="min-w-0 truncate font-normal"
                      >
                        {bundle.name}
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {formError && (
              <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">
                {formError}
              </p>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={createCollection.isPending}>
                {createCollection.isPending ? 'Creating…' : 'Create collection'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
