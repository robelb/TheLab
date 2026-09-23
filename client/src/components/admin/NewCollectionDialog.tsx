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
import { useCreateCollection } from '@/hooks/use-collections-admin'
import { apiErrorMessage, notifyError, notifySaved } from '@/lib/notify'

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

  const [slug, setSlug] = useState('')
  const [tag, setTag] = useState('')
  const [titleDe, setTitleDe] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [locale, setLocale] = useState<'de' | 'en'>('de')
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setSlug('')
    setTag('')
    setTitleDe('')
    setTitleEn('')
    setLocale('de')
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const created = await createCollection.mutateAsync({
        slug: slug.trim().toLowerCase(),
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
      // Stays open: the message usually names the field to change, and the
      // likeliest one is a slug somebody has already used.
      setError(apiErrorMessage(err, 'Could not create the collection'))
      notifyError(err, 'Could not create the collection')
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
                onChange={(e) => setSlug(e.target.value)}
                placeholder="weihnachten"
                autoFocus
                required
              />
              <p className="text-xs text-muted-foreground">
                The page will be at /c/{slug.trim().toLowerCase() || '…'}
              </p>
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
            <Button type="submit" disabled={createCollection.isPending}>
              {createCollection.isPending ? 'Creating…' : 'Create and add boxes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
