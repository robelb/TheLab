import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
  title,
}: GenerateCampaignDialogProps) {
  const { t } = useTranslation()
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
          <DialogTitle>
            {title ?? t('dashboard.company.generate.title')}
          </DialogTitle>
          <DialogDescription>
            {t('dashboard.company.generate.description')}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={f.handleSubmit(({ brief }) => onSubmit(brief))}
          className="space-y-4"
          noValidate
        >
          <FormField
            id="generate-brief"
            label={t('dashboard.company.generate.brief')}
            optional
            optionalLabel={t('dashboard.company.generate.optional')}
            error={f.errors.brief}
            // Counted down near the limit, so it is never a surprise.
            hint={
              length > CAMPAIGN_BRIEF_MAX * 0.8
                ? t('dashboard.company.generate.charactersLeft', {
                    count: CAMPAIGN_BRIEF_MAX - length,
                  })
                : undefined
            }
          >
            <Textarea
              {...f.register('brief')}
              rows={4}
              placeholder={t('dashboard.company.generate.placeholder')}
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
              {t('dashboard.company.shared.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              <Sparkles className="size-4" />
              {pending
                ? t('dashboard.company.shared.generating')
                : t('dashboard.company.generate.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
