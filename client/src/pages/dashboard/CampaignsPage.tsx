import { ImageIcon, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePostHog } from '@posthog/react'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { GenerateCampaignDialog } from '@/components/dashboard/GenerateCampaignDialog'
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
import { useBrand } from '@/context/BrandContext'
import {
  useCampaignBrandSignals,
  useCampaigns,
  useCreateCampaign,
  useDeleteCampaign,
  useGenerateCampaign,
} from '@/hooks/use-campaigns'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import type { Campaign, CampaignStatus } from '@/types/campaign'

// ── Manual "New campaign" dialog ─────────────────────────────────────────────
function NewCampaignDialog({
  open,
  onOpenChange,
  domain,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  domain: string | null
}) {
  const navigate = useNavigate()
  const posthog = usePostHog()
  const create = useCreateCampaign()
  const [title, setTitle] = useState('')

  const submit = async () => {
    if (!title.trim()) return
    const created = await create.mutateAsync({
      title: title.trim(),
      domain,
    })
    posthog?.capture('campaign created', {
      campaign_id: created.id,
      title: created.title,
      domain,
    })
    onOpenChange(false)
    setTitle('')
    navigate(`/dashboard/campaign/${created.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Name
          </span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Summer essentials"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
          <p className="text-xs text-muted-foreground">
            You'll add products to the bundle on the next screen.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!title.trim() || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create campaign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const BUNDLE_SIZE = 6

const statusVariant: Record<CampaignStatus, 'default' | 'secondary' | 'outline'> =
  {
    approved: 'default',
    draft: 'secondary',
    dismissed: 'outline',
  }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function CampaignsPage() {
  const { brand } = useBrand()
  const { domain } = useAuth()
  const brandSignals = useCampaignBrandSignals()

  const navigate = useNavigate()
  const posthog = usePostHog()
  const { data: campaigns = [], isLoading } = useCampaigns(domain)
  const generate = useGenerateCampaign()
  const remove = useDeleteCampaign()
  const [createOpen, setCreateOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const { id, title } = pendingDelete
    await remove.mutateAsync(id)
    posthog?.capture('campaign deleted', { campaign_id: id, title, domain })
    setPendingDelete(null)
  }

  const handleGenerate = async (brief: string) => {
    const created = await generate.mutateAsync({
      brand: brandSignals,
      bundleSize: BUNDLE_SIZE,
      brief: brief || undefined,
    })
    posthog?.capture('campaign generated', {
      campaign_id: created.id,
      title: created.title,
      bundle_size: BUNDLE_SIZE,
      has_brief: Boolean(brief),
      domain,
    })
    setGenerateOpen(false)
    navigate(`/dashboard/campaign/${created.id}`)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Create a campaign for{' '}
            <span className="font-medium text-foreground">
              {brand.companyName}
            </span>{' '}
            and add a bundle of products.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New campaign
          </Button>
          <Button
            variant="outline"
            onClick={() => setGenerateOpen(true)}
            disabled={generate.isPending}
          >
            <Sparkles className="size-4" />
            {generate.isPending ? 'Generating…' : 'Generate with AI'}
          </Button>
        </div>
      </header>

      <NewCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        domain={domain}
      />
      <GenerateCampaignDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        pending={generate.isPending}
        onSubmit={handleGenerate}
      />

      {generate.isError && (
        <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {(generate.error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-brand border border-border/40">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isLoading || (generate.isPending && campaigns.length === 0)) && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}

            {generate.isPending && campaigns.length > 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Sparkles className="size-4 animate-pulse text-primary" />
                    Assembling a new campaign… (up to a minute)
                  </span>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && campaigns.length === 0 && !generate.isPending && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  No campaigns yet — create your first one.
                </TableCell>
              </TableRow>
            )}

            {campaigns.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-brand border border-border/40 bg-muted/20">
                      {c.heroImageUrl ? (
                        <img
                          src={c.heroImageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <Link
                      to={`/dashboard/campaign/${c.id}`}
                      className="truncate font-medium hover:text-primary hover:underline"
                    >
                      {c.title}
                    </Link>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={statusVariant[c.status]}
                    className={cn(
                      'text-[10px] uppercase',
                      c.status === 'dismissed' && 'text-muted-foreground',
                    )}
                  >
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.products.length}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(c.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/dashboard/campaign/${c.id}`}>Open</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPendingDelete(c)}
                      aria-label={`Delete ${c.title}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” will be permanently removed. This can't be
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
    </div>
  )
}
