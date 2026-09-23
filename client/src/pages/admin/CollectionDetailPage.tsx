import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, ExternalLink, Trash2 } from 'lucide-react'
import { CollectionEditor } from '@/components/admin/CollectionEditor'
import { useAuth } from '@/context/AuthContext'
import {
  useAllCollections,
  useDeleteCollection,
  useUpdateCollection,
} from '@/hooks/use-collections-admin'
import { notifyError, notifySaved } from '@/lib/notify'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * One landing page, on a page of its own.
 *
 * This used to expand inside a row on the list, which was fine while it was a
 * few fields and stopped being fine once it held the running order of the
 * boxes, everything else on the page, the copy in two languages and the
 * customisation switch. A campaign is a thing you sit down and set up; it
 * deserves an address you can return to and send to somebody.
 */
export function CollectionDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can } = useAuth()
  const { data: collections, isPending } = useAllCollections()
  const updateCollection = useUpdateCollection()
  const removeCollection = useDeleteCollection()
  const [copied, setCopied] = useState(false)

  if (!can('manage_all')) return <Navigate to="/dashboard" replace />

  const collection = collections?.find((c) => c.id === id)

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <h1 className="font-display text-xl font-semibold">
          That landing page is gone
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          It may have been deleted. The ones that are left are on the list.
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard/admin/collections">Back to landing pages</Link>
        </Button>
      </div>
    )
  }

  /** The link marketing puts on the landing page, ready to paste. */
  const link = `${window.location.origin}/c/${collection.slug}?lang=${collection.defaultLocale}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Clipboard blocked — the link is on screen to copy by hand. */
    }
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
        <Link to="/dashboard/admin/collections">
          <ArrowLeft className="size-4" />
          Landing pages
        </Link>
      </Button>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold">
              /c/{collection.slug}
              <Badge variant="outline" className="uppercase">
                {collection.defaultLocale}
              </Badge>
              <Badge variant="secondary">#{collection.tag}</Badge>
              {!collection.allowCustomization && (
                <Badge variant="outline">Buy only</Badge>
              )}
              {!collection.active && (
                <Badge variant="outline" className="text-muted-foreground">
                  Ended
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              {collection.title.de}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={copyLink}>
              <Copy className="size-4" />
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={`/c/${collection.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Preview
              </a>
            </Button>
          </div>
        </div>

        {/* What the agency gets. Campaign parameters go on the end of it. */}
        <p className="break-all rounded-brand bg-muted/40 px-3 py-2 font-mono text-xs">
          {link}
        </p>
      </header>

      <CollectionEditor collection={collection} />

      {/* Ending and deleting sit apart from the editing, at the bottom, because
          neither is something anybody does by accident on the way past. */}
      <section className="space-y-3 rounded-brand border border-border/40 p-4">
        <div>
          <h2 className="font-display text-base font-semibold">The campaign</h2>
          <p className="text-xs text-muted-foreground">
            {collection.active
              ? 'Live — ads pointing here reach the page.'
              : 'Ended — ads pointing here land on a "no longer available" page.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={updateCollection.isPending}
            onClick={() =>
              updateCollection.mutate(
                { id: collection.id, input: { active: !collection.active } },
                {
                  onSuccess: () =>
                    notifySaved(
                      collection.active
                        ? `/c/${collection.slug} is no longer live`
                        : `/c/${collection.slug} is live again`,
                      collection.active
                        ? 'Ads pointing at it will land on a "no longer available" page.'
                        : undefined,
                    ),
                  onError: (err) =>
                    notifyError(err, 'Could not change the campaign'),
                },
              )
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
                removeCollection.mutate(collection.id, {
                  onSuccess: () => {
                    notifySaved(`/c/${collection.slug} deleted`)
                    navigate('/dashboard/admin/collections')
                  },
                  onError: (err) =>
                    notifyError(err, 'Could not delete the collection'),
                })
              }
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </section>
    </div>
  )
}
