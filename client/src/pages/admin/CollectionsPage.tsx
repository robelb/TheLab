import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Check, Copy, ExternalLink, Pencil, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { useAllCollections } from '@/hooks/use-collections-admin'
import { NewCollectionDialog } from '@/components/admin/NewCollectionDialog'
import {
  TablePagination,
  paginate,
} from '@/components/dashboard/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * The landing pages the ads point at.
 *
 * One of these is what a paid click arrives on: a headline, up to a few boxes
 * to buy outright, and a tag that decides which of the catalogue shows up
 * underneath. Marketing changes these mid-campaign, which is why they are rows
 * rather than code.
 *
 * A table, like the rest of the dashboard, and nothing more. Setting one up
 * happens on its own page, which is where the boxes, the products and the copy
 * live. Searched and paged here rather than on the server: there are only ever
 * a handful, and the list is already loaded whole for the detail page.
 */
export function CollectionsPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const navigate = useNavigate()
  const collectionsQuery = useAllCollections()

  const [copied, setCopied] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  if (!can('manage_all')) return <Navigate to="/dashboard" replace />

  const all = collectionsQuery.data ?? []
  const needle = search.trim().toLowerCase()
  const matching = needle
    ? all.filter(
        (c) =>
          c.slug.includes(needle) ||
          c.tag.includes(needle) ||
          c.title.de.toLowerCase().includes(needle) ||
          c.title.en.toLowerCase().includes(needle),
      )
    : all
  const { rows, pagination } = paginate(matching, page, limit)

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
      /* Clipboard blocked — the link is on the page behind "Edit" to copy. */
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">{t('dashboard.admin.collections.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {collectionsQuery.data
              ? t('dashboard.admin.collections.summary', { count: all.length })
              : t('dashboard.admin.collections.intro')}
          </p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {t('dashboard.admin.collections.new')}
        </Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder={t('dashboard.admin.collections.searchPlaceholder')}
          className="pl-9"
        />
      </div>

      {collectionsQuery.error && (
        <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('dashboard.admin.collections.loadFailed')}
        </p>
      )}

      <div className="overflow-hidden rounded-brand border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted">
              <TableHead>{t('dashboard.admin.collections.columns.page')}</TableHead>
              <TableHead>{t('dashboard.admin.collections.columns.tag')}</TableHead>
              <TableHead>{t('dashboard.admin.collections.columns.boxes')}</TableHead>
              <TableHead>{t('dashboard.admin.collections.columns.mode')}</TableHead>
              <TableHead>{t('dashboard.admin.collections.columns.status')}</TableHead>
              <TableHead className="text-right">
                {t('dashboard.admin.collections.columns.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {collectionsQuery.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="h-3 w-52" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-12" />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Skeleton className="size-8 rounded-brand" />
                      <Skeleton className="size-8 rounded-brand" />
                      <Skeleton className="size-8 rounded-brand" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}

            {!collectionsQuery.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-muted-foreground"
                >
                  {needle ? (
                    t('dashboard.admin.collections.noMatch', { query: search.trim() })
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      {t('dashboard.admin.collections.empty')}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCreating(true)}
                      >
                        <Plus className="size-4" />
                        {t('dashboard.admin.collections.createFirst')}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}

            {!collectionsQuery.isLoading &&
              rows.map((collection) => {
                // Defensive: an older cached response has no bundles on it.
                const boxes = collection.featuredBundles ?? []
                const editUrl = `/dashboard/admin/collections/${collection.id}`
                return (
                  <TableRow
                    key={collection.id}
                    className="cursor-pointer"
                    onClick={() => navigate(editUrl)}
                  >
                    <TableCell>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Link
                            to={editUrl}
                            className="font-medium hover:text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            /c/{collection.slug}
                          </Link>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {collection.defaultLocale}
                          </Badge>
                        </div>
                        <p className="max-w-xs truncate text-xs text-muted-foreground">
                          {collection.title.de}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">#{collection.tag}</Badge>
                    </TableCell>
                    <TableCell
                      className="tabular-nums"
                      title={boxes.map((b) => b.name).join(', ') || undefined}
                    >
                      {boxes.length || (
                        <span className="text-muted-foreground">
                          {t('dashboard.admin.collections.noBoxes')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {collection.allowCustomization ? (
                        <span className="text-sm">
                          {t('dashboard.admin.collections.modes.customize')}
                        </span>
                      ) : collection.allowBoxBuilding ? (
                        <span className="text-sm">
                          {t('dashboard.admin.collections.modes.build')}
                        </span>
                      ) : (
                        <Badge variant="outline">
                          {t('dashboard.admin.collections.modes.buyOnly')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {collection.active ? (
                        <Badge
                          variant="outline"
                          className="border-primary/40 bg-primary/10 text-primary"
                        >
                          {t('dashboard.admin.collections.live')}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-border text-muted-foreground"
                        >
                          {t('dashboard.admin.collections.ended')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t('dashboard.admin.collections.copyLinkAria', {
                            slug: collection.slug,
                          })}
                          title={t('dashboard.admin.collections.copyLink')}
                          onClick={() =>
                            copyLink(collection.slug, collection.defaultLocale)
                          }
                        >
                          {copied === collection.slug ? (
                            <Check className="size-4 text-primary" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </Button>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          aria-label={t('dashboard.admin.collections.openAria', {
                            slug: collection.slug,
                          })}
                          title={t('dashboard.admin.collections.openTitle')}
                        >
                          <a
                            href={`/c/${collection.slug}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        </Button>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          aria-label={t('dashboard.admin.collections.editAria', {
                            slug: collection.slug,
                          })}
                          title={t('dashboard.admin.collections.edit')}
                        >
                          <Link to={editUrl}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        pagination={pagination}
        shown={rows.length}
        onPageChange={setPage}
        onLimitChange={(next) => {
          setLimit(next)
          setPage(1)
        }}
      />

      <NewCollectionDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
