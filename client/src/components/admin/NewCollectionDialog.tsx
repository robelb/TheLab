import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldMessage, FormAlert, FormField } from '@/components/ui/form-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useAllCollections,
  useCreateCollection,
} from '@/hooks/use-collections-admin'
import {
  apiErrorField,
  apiErrorMessage,
  notifyError,
  notifySaved,
} from '@/lib/notify'
import { useZodForm } from '@/lib/form'
import { newCollectionSchema, toSlug } from '@/lib/schemas/dashboard'

/** The first free variant of a taken slug: christmas-2, christmas-3, … */
function freeSlug(base: string, taken: Set<string>): string {
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

/**
 * Naming a landing page, and nothing else.
 *
 * Only what a page cannot exist without: where it lives, what it collects, and
 * what it says at the top. The boxes and the products go in afterwards, on the
 * page's own screen, where they can be seen and reordered — so this closes by
 * going there rather than by leaving somebody looking at an empty list.
 */
export function NewCollectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createCollection = useCreateCollection()
  // Already loaded by the list behind this dialog, so checking a slug against
  // it costs nothing and answers before anybody presses the button.
  const { data: existing } = useAllCollections()

  const empty = { slug: '', tag: '', titleDe: '', titleEn: '', locale: 'de' as 'de' | 'en' }
  const f = useZodForm({ schema: newCollectionSchema, initialValues: empty, idPrefix: 'new-' })
  const { slug, locale } = f.values
  const [error, setError] = useState<string | null>(null)
  // A problem with the URL segment specifically — shown under that field.
  const [slugError, setSlugError] = useState<string | null>(null)

  const cleanSlug = toSlug(slug)
  const takenSlugs = new Set((existing ?? []).map((c) => c.slug))
  const clash = cleanSlug ? existing?.find((c) => c.slug === cleanSlug) : undefined
  const suggestion = clash ? freeSlug(cleanSlug, takenSlugs) : null
  const slugProblem =
    slugError ??
    (clash
      ? t(
          clash.active
            ? 'dashboard.admin.newCollection.slugTaken'
            : 'dashboard.admin.newCollection.slugTakenEnded',
          { slug: cleanSlug, title: clash.title.de },
        )
      : f.errors.slug)

  function reset() {
    f.reset(empty)
    setError(null)
    setSlugError(null)
  }

  /** Runs once the schema has passed — see `useZodForm`. */
  async function submit(values: {
    slug: string
    tag: string
    titleDe: string
    titleEn: string
    locale: 'de' | 'en'
  }) {
    setError(null)
    setSlugError(null)
    // Caught here rather than by the server so the answer comes with a
    // suggestion and the rest of the form stays as it was typed.
    if (clash) return
    try {
      const created = await createCollection.mutateAsync({
        slug: values.slug,
        tag: values.tag.toLowerCase(),
        title: { de: values.titleDe, en: values.titleEn || values.titleDe },
        subtitle: null,
        featuredBundleIds: [],
        defaultLocale: values.locale,
        active: true,
        // On by default; turned off per page in the editor.
        allowCustomization: true,
        sortOrder: 0,
      })
      notifySaved(
        t('dashboard.admin.newCollection.created', { slug: created.slug }),
        t('dashboard.admin.newCollection.createdDetail'),
      )
      reset()
      onOpenChange(false)
      // Straight into filling it — an empty landing page is never the goal.
      navigate(`/dashboard/admin/collections/${created.id}`)
    } catch (err) {
      // Stays open so nothing typed is lost. A refusal about the URL goes
      // under the URL field — the likeliest one is a slug somebody used
      // between this list loading and the button being pressed.
      const fallback = t('dashboard.admin.newCollection.createFailed')
      const message = apiErrorMessage(err, fallback)
      if (apiErrorField(err) === 'slug') {
        setSlugError(message)
        document.getElementById('new-slug')?.focus()
      } else {
        setError(message)
        notifyError(err, fallback)
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('dashboard.admin.newCollection.title')}</DialogTitle>
          <DialogDescription>
            {t('dashboard.admin.newCollection.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={f.handleSubmit(submit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-slug">
                {t('dashboard.admin.newCollection.slugLabel')}
              </Label>
              <Input
                {...f.register('slug')}
                onChange={(e) => {
                  f.set('slug', e.target.value)
                  setSlugError(null)
                }}
                placeholder="weihnachten"
                autoFocus
                aria-invalid={slugProblem ? true : undefined}
                aria-describedby={slugProblem ? 'new-slug-error' : 'new-slug-hint'}
              />
              <FieldMessage
                id="new-slug"
                error={slugProblem ?? undefined}
                hint={t('dashboard.admin.newCollection.slugHint', {
                  slug: cleanSlug || '…',
                })}
              />
              {slugProblem && suggestion && (
                <button
                  type="button"
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    f.set('slug', suggestion)
                    setSlugError(null)
                  }}
                >
                  {t('dashboard.admin.newCollection.useSuggestion', {
                    slug: suggestion,
                  })}
                </button>
              )}
            </div>

            <FormField
              id="new-tag"
              label={t('dashboard.admin.newCollection.tagLabel')}
              error={f.errors.tag}
              hint={t('dashboard.admin.newCollection.tagHint')}
            >
              <Input {...f.register('tag')} placeholder="christmas" />
            </FormField>
          </div>

          <FormField id="new-titleDe" label={t('dashboard.admin.collectionForm.headlineDe')} error={f.errors.titleDe}>
            <Input {...f.register('titleDe')} />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="new-titleEn"
              label={t('dashboard.admin.collectionForm.headlineEn')}
              error={f.errors.titleEn}
              hint={t('dashboard.admin.newCollection.headlineEnHint')}
              optional
            >
              <Input {...f.register('titleEn')} />
            </FormField>

            <div className="space-y-2">
              <Label htmlFor="new-locale">
                {t('dashboard.admin.collectionForm.locale')}
              </Label>
              <Select
                value={locale}
                onValueChange={(v) => f.set('locale', v as 'de' | 'en')}
              >
                <SelectTrigger id="new-locale" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">{t('common.german')}</SelectItem>
                  <SelectItem value="en">{t('common.english')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <FormAlert>{error}</FormAlert>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('dashboard.admin.common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createCollection.isPending || Boolean(clash)}
            >
              {createCollection.isPending
                ? t('dashboard.admin.common.creating')
                : t('dashboard.admin.newCollection.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
