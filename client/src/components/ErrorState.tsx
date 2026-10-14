import { AlertTriangle, Clock, RotateCw, SearchX, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { errorKind, type ErrorKind } from '@/lib/errors'
import { cn } from '@/lib/utils'

type ErrorScreenKind = ErrorKind | 'crash'

const ICONS: Record<ErrorScreenKind, typeof AlertTriangle> = {
  offline: WifiOff,
  network: WifiOff,
  notFound: SearchX,
  rateLimited: Clock,
  server: AlertTriangle,
  unknown: AlertTriangle,
  crash: AlertTriangle,
}

interface ErrorStateProps {
  /** The error to explain. Its kind picks the wording, unless `kind` is set. */
  error?: unknown
  /** Overrides what `error` says, e.g. `notFound` for a query that came back empty. */
  kind?: ErrorScreenKind
  /** Shown as "Try again" when trying again can help (never for a 404). */
  onRetry?: () => void
  /**
   * Where the way-out button goes, and what it says. Defaults to the shop;
   * `null` leaves it out (when the shop's home *is* the page that failed).
   */
  homeTo?: string | null
  homeLabel?: string
  /** Replace the standard title/body, e.g. a collection whose offer ended. */
  title?: string
  body?: string
  className?: string
}

/**
 * What a page shows instead of its content when that content could not be had.
 *
 * Always the same three things: what happened in words a shopper understands,
 * what they can do about it, and a way back to the shop — so nobody is left on
 * a screen with "Request failed with status code 500" and no button.
 */
export function ErrorState({
  error,
  kind,
  onRetry,
  homeTo = '/',
  homeLabel,
  title,
  body,
  className,
}: ErrorStateProps) {
  const { t } = useTranslation()
  const resolved: ErrorScreenKind = kind ?? errorKind(error)
  const Icon = ICONS[resolved]
  const canRetry = Boolean(onRetry) && resolved !== 'notFound'

  return (
    <div
      role="alert"
      className={cn(
        'mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center sm:py-20',
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold">
          {title ?? t(`errors.page.${resolved}.title`)}
        </h1>
        <p className="text-muted-foreground">
          {body ?? t(`errors.page.${resolved}.body`)}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {canRetry && (
          <Button type="button" onClick={onRetry} className="gap-2">
            <RotateCw className="size-4" aria-hidden />
            {t('errors.actions.tryAgain')}
          </Button>
        )}
        {homeTo !== null && (
          <Button asChild variant={canRetry ? 'outline' : 'default'}>
            <Link to={homeTo}>{homeLabel ?? t('errors.actions.backToShop')}</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
