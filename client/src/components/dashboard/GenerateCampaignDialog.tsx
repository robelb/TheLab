import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'
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
import { FormField } from '@/components/ui/form-field'
import { useZodForm } from '@/lib/form'
import { CAMPAIGN_BRIEF_MAX, campaignBriefSchema } from '@/lib/schemas/dashboard'

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
  const f = useZodForm({
    schema: campaignBriefSchema,
    initialValues: { brief: '' },
    idPrefix: 'generate-',
  })
  const { reset } = f
  const length = f.values.brief.length

  // Reset the field each time the dialog opens.
  useEffect(() => {
    if (open) reset({ brief: '' })
  }, [open, reset])

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

        <form
          onSubmit={f.handleSubmit(({ brief }) => onSubmit(brief))}
          className="space-y-4"
          noValidate
        >
          <FormField
            id="generate-brief"
            label="Brief"
            optional
            error={f.errors.brief}
            // Counted down near the limit, so it is never a surprise.
            hint={
              length > CAMPAIGN_BRIEF_MAX * 0.8
                ? `${CAMPAIGN_BRIEF_MAX - length} characters left.`
                : undefined
            }
          >
            <Textarea
              {...f.register('brief')}
              rows={4}
              placeholder="e.g. A summer outdoor kit for young hikers — bright, energetic, adventure vibe."
              autoFocus
            />
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              <Sparkles className="size-4" />
              {pending ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
