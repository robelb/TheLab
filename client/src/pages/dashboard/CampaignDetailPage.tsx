import { ArrowLeft, Check, Plus, Search, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CampaignProductTile } from '@/components/dashboard/CampaignProductTile'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useCampaign,
  useDeleteCampaign,
  useUpdateCampaign,
} from '@/hooks/use-campaigns'
import { useDebounce } from '@/hooks/use-debounce'
import { useProducts } from '@/hooks/use-products'
import type { Campaign } from '@/types/campaign'

function AddProductDialog({
  open,
  onOpenChange,
  existingIds,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingIds: string[]
  onAdd: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const q = useDebounce(search, 400)
  const { data, isFetching } = useProducts({ page: 1, limit: 20, q })
  const products = (data?.data ?? []).filter((p) => !existingIds.includes(p.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a product</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {isFetching && products.length === 0 && (
            <Skeleton className="h-12 w-full" />
          )}
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onAdd(p.id)}
              className="flex w-full items-center gap-3 rounded-brand p-2 text-left transition-colors hover:bg-muted/40"
            >
              <img
                src={p.image}
                alt=""
                className="size-10 shrink-0 rounded-brand border border-border/40 object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <Plus className="size-4 text-primary" />
            </button>
          ))}
          {!isFetching && products.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No products found.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CampaignEditor({ campaign }: { campaign: Campaign }) {
  const navigate = useNavigate()
  const update = useUpdateCampaign()
  const remove = useDeleteCampaign()

  const [title, setTitle] = useState(campaign.title)
  const [addOpen, setAddOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const dirty = title !== campaign.title

  const saveEdits = () =>
    update.mutate({ id: campaign.id, input: { title } })
  const confirmDelete = async () => {
    await remove.mutateAsync(campaign.id)
    navigate('/dashboard/campaign')
  }
  const setStatus = (status: 'approved' | 'dismissed') =>
    update.mutate({ id: campaign.id, input: { status } })
  const removeProduct = (id: string) =>
    update.mutate({
      id: campaign.id,
      input: { productIds: campaign.productIds.filter((p) => p !== id) },
    })
  const addProduct = (id: string) => {
    update.mutate({
      id: campaign.id,
      input: { productIds: [...campaign.productIds, id] },
    })
    setAddOpen(false)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Campaign</CardTitle>
          <Badge variant="secondary" className="text-[10px] uppercase">
            {campaign.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {campaign.heroImageUrl && (
          <>
            <button
              type="button"
              onClick={() => setPreview(true)}
              className="block w-full overflow-hidden rounded-brand border border-border/40"
              aria-label="Preview campaign image"
            >
              <img
                src={campaign.heroImageUrl}
                alt={campaign.title}
                className="max-h-96 w-full cursor-zoom-in object-contain transition-opacity hover:opacity-95"
              />
            </button>
            <Dialog open={preview} onOpenChange={setPreview}>
              <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
                <DialogTitle className="sr-only">Campaign image</DialogTitle>
                <img
                  src={campaign.heroImageUrl}
                  alt={campaign.title}
                  className="max-h-[85vh] w-full rounded-brand object-contain"
                />
              </DialogContent>
            </Dialog>
          </>
        )}

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Name</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {dirty && (
          <Button size="sm" onClick={saveEdits} disabled={update.isPending}>
            Save changes
          </Button>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Bundle ({campaign.products.length})
            </span>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Add product
            </Button>
          </div>
          {campaign.products.length === 0 ? (
            <p className="rounded-brand border border-border/40 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              No products in this bundle yet — add some.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {campaign.products.map((p) => (
                <CampaignProductTile
                  key={p.id}
                  product={p}
                  onRemove={() => removeProduct(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-4">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={remove.isPending}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
          <div className="flex flex-wrap gap-2">
            {campaign.status !== 'dismissed' && (
              <Button
                variant="ghost"
                onClick={() => setStatus('dismissed')}
                disabled={update.isPending}
              >
                <XCircle className="size-4" />
                Dismiss
              </Button>
            )}
            {campaign.status !== 'approved' && (
              <Button
                onClick={() => setStatus('approved')}
                disabled={update.isPending}
              >
                <Check className="size-4" />
                Approve &amp; launch
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      <AddProductDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingIds={campaign.productIds}
        onAdd={addProduct}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              “{campaign.title}” will be permanently removed. This can't be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: campaign, isLoading, error } = useCampaign(id)

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
        <Link to="/dashboard/campaign">
          <ArrowLeft className="size-4" />
          All campaigns
        </Link>
      </Button>

      {isLoading && <Skeleton className="h-96 rounded-brand" />}

      {!isLoading && (error || !campaign) && (
        <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Campaign not found'}
        </p>
      )}

      {campaign && <CampaignEditor key={campaign.id} campaign={campaign} />}
    </div>
  )
}
