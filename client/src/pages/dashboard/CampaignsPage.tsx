import { ImageIcon, Megaphone, Plus, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePostHog } from '@posthog/react'
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
import { Textarea } from '@/components/ui/textarea'
import { useBrand } from '@/context/BrandContext'
import {
  useCampaignBrandSignals,
  useCampaigns,
  useCreateCampaign,
  useGenerateCampaign,
} from '@/hooks/use-campaigns'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import type { CampaignStatus } from '@/types/campaign'

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
  const [description, setDescription] = useState('')

  const submit = async () => {
    if (!title.trim()) return
    const created = await create.mutateAsync({
      title: title.trim(),
      description: description.trim() || undefined,
      domain,
    })
    posthog?.capture('campaign created', {
      campaign_id: created.id,
      title: created.title,
      domain,
    })
    onOpenChange(false)
    setTitle('')
    setDescription('')
    navigate(`/dashboard/campaign/${created.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Title
            </span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summer essentials"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Marketing copy (optional)
            </span>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
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
  const { session } = useAuth()
  const domain = session?.domain ?? null
  const brandSignals = useCampaignBrandSignals()

  const navigate = useNavigate()
  const posthog = usePostHog()
  const { data: campaigns = [], isLoading, isSuccess } = useCampaigns(domain)
  const generate = useGenerateCampaign()
  const [createOpen, setCreateOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)

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

  // Auto-assemble the first campaign ONLY when the fetch has succeeded and
  // returned zero campaigns. Gating on isSuccess (not just isLoading) means we
  // never auto-generate while loading, on a fetch error, or when any campaign
  // already exists.
  const brandRef = useRef(brandSignals)
  brandRef.current = brandSignals
  const autoTriggered = useRef(false)
  useEffect(() => {
    if (!isSuccess || autoTriggered.current || generate.isPending) return
    if (campaigns.length === 0) {
      autoTriggered.current = true
      generate.mutate({ brand: brandRef.current, bundleSize: BUNDLE_SIZE })
    }
  }, [isSuccess, campaigns.length, generate])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Starter campaigns auto-assembled for{' '}
            <span className="font-medium text-foreground">
              {brand.companyName}
            </span>{' '}
            from your catalog.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New campaign
          </Button>
          <Button
            onClick={() => setGenerateOpen(true)}
            disabled={generate.isPending}
          >
            <Sparkles className="size-4" />
            {generate.isPending ? 'Generating…' : 'Generate campaign'}
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
                  No campaigns yet — generate your first one.
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
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/dashboard/campaign/${c.id}`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {campaigns.length === 0 && !isLoading && !generate.isPending && (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Megaphone className="size-3.5" />
          Your Company Kit assembles a ready-to-launch first campaign from your
          brand.
        </p>
      )}
    </div>
  )
}
