import { Component, type ErrorInfo, type ReactNode } from 'react'
import posthog from 'posthog-js'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/button'

interface BoundaryProps {
  /** A new value clears the error: moving to another page starts fresh. */
  resetKey: string
  homeTo: string
  homeLabel?: string
  children: ReactNode
}

interface BoundaryState {
  error: unknown
  resetKey: string
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState,
  ): Partial<BoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    return { error: null, resetKey: props.resetKey }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    posthog.captureException(error, { componentStack: info.componentStack ?? undefined })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <ErrorState
        kind="crash"
        onRetry={() => this.setState({ error: null })}
        homeTo={this.props.homeTo}
        homeLabel={this.props.homeLabel}
      />
    )
  }
}

/**
 * Catches a page that crashes while rendering, and shows a way out instead of
 * a blank screen.
 *
 * Sits around the page content only, so the header, cart and language switch
 * keep working around the error, and leaving for another page clears it.
 */
export function RouteErrorBoundary({
  homeTo = '/',
  homeLabel,
  children,
}: {
  homeTo?: string
  homeLabel?: string
  children: ReactNode
}) {
  const { pathname } = useLocation()
  return (
    <Boundary resetKey={pathname} homeTo={homeTo} homeLabel={homeLabel}>
      {children}
    </Boundary>
  )
}

/**
 * The last line: the whole app failed to render, router and all.
 *
 * No router or providers to lean on here, so the way out is a plain link and a
 * full reload. PostHog's boundary around it has already reported the error.
 */
export function AppCrashScreen() {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <div className="max-w-md space-y-2">
        <h1 className="font-display text-2xl font-bold">{t('errors.page.crash.title')}</h1>
        <p className="text-muted-foreground">{t('errors.page.crash.body')}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" className="gap-2" onClick={() => window.location.reload()}>
          <RotateCw className="size-4" aria-hidden />
          {t('errors.actions.reload')}
        </Button>
        <Button asChild variant="outline">
          <a href="/">{t('errors.actions.backToShop')}</a>
        </Button>
      </div>
    </div>
  )
}
