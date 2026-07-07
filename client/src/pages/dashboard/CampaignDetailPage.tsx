import {
  ArrowLeft,
  Check,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { uploadVideo } from '@/api/uploads'
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
import { Textarea } from '@/components/ui/textarea'
import {
  useAddCampaignVideo,
  useCampaign,
  useDeleteCampaign,
  useDeleteCampaignVideo,
  useUpdateCampaign,
} from '@/hooks/use-campaigns'
import { useDebounce } from '@/hooks/use-debounce'
import { useProducts } from '@/hooks/use-products'
import { readVideoMeta } from '@/lib/video'
import type {
  Campaign,
  CampaignVideoItem,
  VideoOrientation,
} from '@/types/campaign'

/** ISO timestamp → `YYYY-MM-DD` for a native date input (empty when null). */
const isoToDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

function formatWindow(start: string | null, end: string | null): string {
  const s = isoToDateInput(start)
  const e = isoToDateInput(end)
  if (s && e) return `${s} → ${e}`
  if (s) return `From ${s}`
  if (e) return `Until ${e}`
  return 'Always on'
}

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

function AddVideoDialog({
  open,
  onOpenChange,
  campaignId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
}) {
  const add = useAddCampaignVideo()
  const [file, setFile] = useState<File | null>(null)
  const [localUrl, setLocalUrl] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<VideoOrientation | null>(null)
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    if (localUrl) URL.revokeObjectURL(localUrl)
    setFile(null)
    setLocalUrl(null)
    setOrientation(null)
    setDescription('')
    setStartsAt('')
    setEndsAt('')
    setError(null)
  }

  const pick = async (f: File) => {
    setError(null)
    try {
      const meta = await readVideoMeta(f)
      if (localUrl) URL.revokeObjectURL(localUrl)
      setFile(f)
      setLocalUrl(URL.createObjectURL(f))
      setOrientation(meta.orientation)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read video')
    }
  }

  const submit = async () => {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const url = await uploadVideo(file)
      await add.mutateAsync({
        campaignId,
        input: {
          url,
          orientation,
          description: description.trim() || null,
          startsAt: startsAt || null,
          endsAt: endsAt || null,
        },
      })
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add video')
    } finally {
      setUploading(false)
    }
  }

  const orientationHint =
    orientation === 'portrait'
      ? 'Shows in the desktop side rail'
      : orientation === 'landscape'
        ? 'Shows as the mobile hero banner'
        : null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add campaign video</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {localUrl && (
            <div className="overflow-hidden rounded-brand border border-border/40 bg-black/5">
              <video
                src={localUrl}
                controls
                muted
                playsInline
                className={
                  orientation === 'portrait'
                    ? 'mx-auto max-h-72 w-auto'
                    : 'max-h-72 w-full object-contain'
                }
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <label className="cursor-pointer">
                <Upload className="size-4" />
                {file ? 'Choose a different file' : 'Choose video'}
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void pick(f)
                    e.target.value = ''
                  }}
                />
              </label>
            </Button>
            {orientation && (
              <Badge variant="secondary" className="text-[10px] uppercase">
                {orientation}
              </Badge>
            )}
            {orientationHint && (
              <span className="text-xs text-muted-foreground">
                {orientationHint}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Description
            </span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this video about? Used to match it to what shoppers are browsing."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Show from
              </span>
              <Input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Show until
              </span>
              <Input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={!file || uploading}>
              {uploading ? 'Uploading…' : 'Add video'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CampaignEditor({ campaign }: { campaign: Campaign }) {
  const navigate = useNavigate()
  const update = useUpdateCampaign()
  const remove = useDeleteCampaign()
  const deleteVideo = useDeleteCampaignVideo()

  const [title, setTitle] = useState(campaign.title)
  const [addOpen, setAddOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [playingVideo, setPlayingVideo] = useState<CampaignVideoItem | null>(
    null,
  )
  const [deleteOpen, setDeleteOpen] = useState(false)

  const dirty = title !== campaign.title

  const saveEdits = () => update.mutate({ id: campaign.id, input: { title } })
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
  const removeVideo = (videoId: string) =>
    deleteVideo.mutate({ campaignId: campaign.id, videoId })

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

        <div className="space-y-2 border-t border-border/40 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Videos ({campaign.videos.length})
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVideoOpen(true)}
            >
              <Plus className="size-4" />
              Add video
            </Button>
          </div>
          {campaign.videos.length === 0 ? (
            <p className="rounded-brand border border-border/40 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              No videos yet — add one to run as a storefront ad.
            </p>
          ) : (
            <ul className="space-y-2">
              {campaign.videos.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center gap-3 rounded-brand border border-border/40 p-2"
                >
                  <button
                    type="button"
                    onClick={() => setPlayingVideo(v)}
                    className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-label={`Play video: ${v.description || 'campaign video'}`}
                  >
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-brand border border-border/40 bg-black">
                      <video
                        src={v.url}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/40">
                        <Play className="size-5 fill-white text-white drop-shadow" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {v.orientation && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase"
                          >
                            {v.orientation}
                          </Badge>
                        )}
                        <span className="truncate text-sm">
                          {v.description || 'No description'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatWindow(v.startsAt, v.endsAt)}
                      </p>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeVideo(v.id)}
                    disabled={deleteVideo.isPending}
                    aria-label="Delete video"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
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

      <AddVideoDialog
        open={videoOpen}
        onOpenChange={setVideoOpen}
        campaignId={campaign.id}
      />

      <Dialog
        open={Boolean(playingVideo)}
        onOpenChange={(o) => !o && setPlayingVideo(null)}
      >
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">
            {playingVideo?.description || 'Campaign video'}
          </DialogTitle>
          {playingVideo && (
            <video
              key={playingVideo.id}
              src={playingVideo.url}
              controls
              autoPlay
              playsInline
              className={
                playingVideo.orientation === 'portrait'
                  ? 'mx-auto max-h-[85vh] w-auto rounded-brand'
                  : 'w-full rounded-brand'
              }
            />
          )}
        </DialogContent>
      </Dialog>

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
