import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { cn } from '@/lib/utils'

/**
 * What the URL segment will actually be.
 *
 * The server only takes lowercase letters, digits and hyphens. Rather than
 * refusing "Weihnachten 2026", it becomes weihnachten-2026 — the preview line
 * under the field shows the result, so nothing is changed behind anyone's back.
 */
function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

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
  const navigate = useNavigate()
  const createCollection = useCreateCollection()
  // Already loaded by the list behind this dialog, so checking a slug against
  // it costs nothing and answers before anybody presses the button.
  const { data: existing } = useAllCollections()

  const [slug, setSlug] = useState('')
  const [tag, setTag] = useState('')
  const [titleDe, setTitleDe] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [locale, setLocale] = useState<'de' | 'en'>('de')
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
      ? `/c/${cleanSlug} is already taken by “${clash.title.de}”${clash.active ? '' : ' (ended)'}. Each landing page needs its own URL.`
      : null)

  function reset() {
    setSlug('')
    setTag('')
    setTitleDe('')
    setTitleEn('')
    setLocale('de')
    setError(null)
    setSlugError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSlugError(null)
    if (!cleanSlug) {
      setSlugError('Enter a URL segment using letters or digits, e.g. weihnachten.')
      return
    }
    // Caught here rather than by the server so the answer comes with a
    // suggestion and the rest of the form stays as it was typed.
    if (clash) return
    try {
      const created = await createCollection.mutateAsync({
        slug: cleanSlug,
        tag: tag.trim().toLowerCase(),
        title: { de: titleDe.trim(), en: titleEn.trim() || titleDe.trim() },
        subtitle: null,
        featuredBundleIds: [],
        defaultLocale: locale,
        active: true,
        // On by default; turned off per page in the editor.
        allowCustomization: true,
        sortOrder: 0,
      })
      notifySaved(
        `/c/${created.slug} created`,
        'Now add the boxes and products it should show.',
      )
      reset()
      onOpenChange(false)
      // Straight into filling it — an empty landing page is never the goal.
      navigate(`/dashboard/admin/collections/${created.id}`)
    } catch (err) {
      // Stays open so nothing typed is lost. A refusal about the URL goes
      // under the URL field — the likeliest one is a slug somebody used
      // between this list loading and the button being pressed.
      const message = apiErrorMessage(err, 'Could not create the landing page')
      if (apiErrorField(err) === 'slug') {
        setSlugError(message)
        document.getElementById('new-slug')?.focus()
      } else {
        setError(message)
        notifyError(err, 'Could not create the landing page')
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
          <DialogTitle>New landing page</DialogTitle>
          <DialogDescription>
            Name it here. You add the boxes and products on the next screen.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-slug">URL segment</Label>
              <Input
                id="new-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value)
                  setSlugError(null)
                }}
                placeholder="weihnachten"
                autoFocus
                required
                aria-invalid={slugProblem ? true : undefined}
                aria-describedby="new-slug-hint"
                className={cn(
                  slugProblem &&
                    'border-destructive focus-visible:ring-destructive/40',
                )}
              />
              {slugProblem ? (
                <div id="new-slug-hint" className="space-y-1" role="alert">
                  <p className="text-xs text-destructive">{slugProblem}</p>
                  {suggestion && (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => {
                        setSlug(suggestion)
                        setSlugError(null)
                      }}
                    >
                      Use /c/{suggestion} instead
                    </button>
                  )}
                </div>
              ) : (
                <p id="new-slug-hint" className="text-xs text-muted-foreground">
                  The page will be at /c/{cleanSlug || '…'}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-tag">Occasion tag</Label>
              <Input
                id="new-tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="christmas"
                required
              />
              <p className="text-xs text-muted-foreground">
                Products carrying this tag fill the page.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-title-de">Headline (German)</Label>
            <Input
              id="new-title-de"
              value={titleDe}
              onChange={(e) => setTitleDe(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-title-en">Headline (English)</Label>
              <Input
                id="new-title-en"
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="Falls back to the German one"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-locale">Language visitors get</Label>
              <Select
                value={locale}
                onValueChange={(v) => setLocale(v as 'de' | 'en')}
              >
                <SelectTrigger id="new-locale" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createCollection.isPending || Boolean(clash)}
            >
              {createCollection.isPending ? 'Creating…' : 'Create and add boxes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
