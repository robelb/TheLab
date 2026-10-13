import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { CircleAlert, Loader2, Mail, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Trans, useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { useNotifySettings, useSaveNotifySettings } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { apiErrorMessage } from '@/lib/notify'
import { formatDateTime } from '@/utils/format'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-brand border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/**
 * Who is emailed when a request comes in. Super admins only; the list is
 * saved on the server and applies to the next request, no redeploy needed.
 */
export function NotificationsPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { data, isLoading } = useNotifySettings()
  const save = useSaveNotifySettings()

  const [emails, setEmails] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (data) setEmails(data.emails)
  }, [data])

  if (!can('manage_all')) return <Navigate to="/dashboard" replace />

  const saved = data?.emails ?? []
  const dirty =
    data?.source === 'environment' ||
    emails.length !== saved.length ||
    emails.some((e, i) => e !== saved[i])

  const add = (e: FormEvent) => {
    e.preventDefault()
    const typed = draft
      .split(/[,;\s]+/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
    if (!typed.length) return
    const bad = typed.find((v) => !EMAIL.test(v))
    if (bad) {
      setError(t('dashboard.admin.notifications.invalidEmail', { email: bad }))
      return
    }
    setEmails((list) => [...new Set([...list, ...typed])])
    setDraft('')
    setError(null)
  }

  const onSave = () =>
    save.mutate(emails, {
      onSuccess: (next) =>
        toast.success(
          next.emails.length
            ? t('dashboard.admin.notifications.saved')
            : t('dashboard.admin.notifications.savedEmpty'),
        ),
      onError: (err) =>
        toast.error(apiErrorMessage(err, t('dashboard.admin.notifications.saveFailed'))),
    })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5" /> {t('dashboard.admin.notifications.title')}
          </CardTitle>
          <CardDescription>
            {t('dashboard.admin.notifications.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !data ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {!data.mailerReady && (
                <Notice>
                  {t('dashboard.admin.notifications.mailerNotReady')}
                </Notice>
              )}
              {data.source === 'environment' && (
                <Notice>
                  <Trans
                    i18nKey="dashboard.admin.notifications.fromEnvironment"
                    components={{ code: <code /> }}
                  />
                </Notice>
              )}

              {emails.length ? (
                <ul className="divide-y divide-border/40 rounded-brand border border-border/40">
                  {emails.map((email) => (
                    <li key={email} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="truncate text-sm">{email}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={t('dashboard.admin.notifications.removeAria', { email })}
                        onClick={() => setEmails((list) => list.filter((e) => e !== email))}
                      >
                        <X className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Notice>{t('dashboard.admin.notifications.empty')}</Notice>
              )}

              <form onSubmit={add} className="space-y-1.5">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    inputMode="email"
                    placeholder="name@biglittlethings.de"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value)
                      setError(null)
                    }}
                    aria-label={t('dashboard.admin.notifications.addAria')}
                  />
                  <Button type="submit" variant="outline" disabled={!draft.trim()}>
                    <Plus className="size-4" /> {t('dashboard.admin.notifications.add')}
                  </Button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </form>

              <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-4">
                <p className="text-xs text-muted-foreground">
                  {data.updatedAt
                    ? t('dashboard.admin.notifications.lastSaved', {
                        date: formatDateTime(data.updatedAt),
                      })
                    : t('dashboard.admin.notifications.notSaved')}
                </p>
                <Button onClick={onSave} disabled={!dirty || save.isPending}>
                  {save.isPending && <Loader2 className="size-4 animate-spin" />}
                  {t('dashboard.admin.notifications.save')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
