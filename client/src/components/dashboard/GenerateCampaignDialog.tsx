import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface GenerateCampaignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Receives the natural-language brief (empty string if none). */
  onSubmit: (brief: string) => void
  pending?: boolean
  title?: string
}

/**
 * Collects an optional natural-language brief, then triggers generation.
 * Leave it blank for a default brand-based campaign, or describe what you want
 * (e.g. "a cosy winter gift set for new hires").
 */
export function GenerateCampaignDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
  title = 'Generate campaign',
}: GenerateCampaignDialogProps) {
  const [brief, setBrief] = useState('')

  // Reset the field each time the dialog opens.
  useEffect(() => {
    if (open) setBrief('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Describe the campaign you want in plain language — theme, season,
            audience, vibe. Leave it blank for a default brand campaign.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          rows={4}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. A summer outdoor kit for young hikers — bright, energetic, adventure vibe."
          autoFocus
        />

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={() => onSubmit(brief.trim())} disabled={pending}>
            <Sparkles className="size-4" />
            {pending ? 'Generating…' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
