import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Copy, ExternalLink, Pencil, Plus } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useAllCollections } from '@/hooks/use-collections-admin'
import { NewCollectionDialog } from '@/components/admin/NewCollectionDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The landing pages the ads point at.
 *
 * One of these is what a paid click arrives on: a headline, up to a few boxes
 * to buy outright, and a tag that decides which of the catalogue shows up
 * underneath. Marketing changes these mid-campaign, which is why they are rows
 * rather than code.
 *
 * A list, and nothing more. Setting one up happens on its own page, which is
 * where the boxes, the products and the copy live.
 */
export function CollectionsPage() {
  const { can } = useAuth()
  const collectionsQuery = useAllCollections()

  const [copied, setCopied] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  if (!can('manage_all')) return <Navigate to="/dashboard" replace />

  const collections = collectionsQuery.data ?? []

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Landing pages</h1>
          <p className="text-sm text-muted-foreground">
            Each one is a page an ad can point at. Hand the link to the agency
            and add the campaign parameters to the end of it.
          </p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New landing page
        </Button>
      </div>

      {collectionsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-brand border border-dashed border-border/60 px-4 py-14 text-center">
          <p className="text-sm text-muted-foreground">
            No landing pages yet.
          </p>
          <Button type="button" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Create the first one
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {collections.map((collection) => {
            // Defensive: an older cached response has no bundles on it, and a
            // dashboard that white-screens is worse than one missing a line.
            const featured = collection.featuredBundles ?? []
            return (
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
                        {!collection.allowCustomization && (
                          <Badge variant="outline">Buy only</Badge>
                        )}
                        {!collection.active && (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
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
                      {featured.length > 0
                        ? `Boxes: ${featured.map((b) => b.name).join(', ')}`
                        : 'No boxes featured — the page shows only the filtered catalogue.'}
                    </p>
                    <Button asChild size="sm">
                      <Link
                        to={`/dashboard/admin/collections/${collection.id}`}
                      >
                        <Pencil className="size-4" />
                        Edit this page
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <NewCollectionDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
