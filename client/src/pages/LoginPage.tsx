import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, Sparkles } from 'lucide-react'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { login, loginWithDefault, isAuthenticated } = useAuth()

  /**
   * Back to whatever asked for a sign-in, not to the shop.
   *
   * `RequireAuth` records the blocked destination in the navigation state, and
   * it is usually the middle of a job: confirming a design sends you to
   * `/build-box`, and an expired session there used to land you on the
   * storefront with the box you just designed nowhere in sight.
   *
   * Only same-origin paths are honoured — the value reaches us through router
   * state, and a bare pathname is the only shape that could ever have been put
   * there legitimately. Anything else goes to the storefront.
   */
  const [searchParams] = useSearchParams()
  const fromState =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof (location.state as { from?: unknown }).from === 'string'
      ? (location.state as { from: string }).from
      : null
  // Two ways in, because there are two things that send people here.
  // `RequireAuth` navigates within the router and can pass state; the API
  // client's 401 handler is a full page load and can only pass a query string.
  const requested = fromState ?? searchParams.get('next')
  const destination =
    requested && requested.startsWith('/') && !requested.startsWith('//')
      ? requested
      : '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate(destination, { replace: true })
  }, [isAuthenticated, navigate, destination])

  async function handleDefaultLogin() {
    setSubmitError(null)
    setLoading(true)
    try {
      await loginWithDefault()
      navigate(destination, { replace: true })
    } catch {
      setSubmitError('Could not open the demo. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate(destination, { replace: true })
    } catch (err) {
      const message =
        err instanceof AxiosError
          ? (err.response?.data?.error ?? 'Could not sign in')
          : err instanceof Error
            ? err.message
            : 'Something went wrong'
      setSubmitError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.35), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, hsl(var(--primary) / 0.15), transparent)',
        }}
      />

      <Card className="relative z-10 w-full max-w-md border-border/60 bg-card/80 shadow-2xl backdrop-blur-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="size-6" />
          </div>
          <CardTitle className="font-display text-2xl tracking-tight">
            {t('auth.welcomeBack')}
          </CardTitle>
          <CardDescription>{t('auth.loginIntro')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.workEmail')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setSubmitError(null)
                }}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setSubmitError(null)
                }}
                disabled={loading}
                required
              />
            </div>

            {submitError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {submitError}
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('auth.signingIn')}
                </>
              ) : (
                t('auth.signIn')
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {t('auth.newHere')}{' '}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              {t('auth.createAccountLink')}
            </Link>
          </p>

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              {t('auth.or')}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={loading}
            onClick={handleDefaultLogin}
          >
            {t('auth.demo')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
