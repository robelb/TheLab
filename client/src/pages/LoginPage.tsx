import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
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
import { FormAlert, FormField } from '@/components/ui/form-field'
import { useZodForm } from '@/lib/form'
import { makeLoginSchema } from '@/lib/schemas/auth'
import { Separator } from '@/components/ui/separator'
import { Loader2, Sparkles } from 'lucide-react'

export function LoginPage() {
  const { t, i18n } = useTranslation()
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
  const schema = useMemo(
    () => makeLoginSchema(t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language],
  )
  const f = useZodForm({ schema, initialValues: { email: '', password: '' } })
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
      setSubmitError(t('common.somethingWentWrong'))
    } finally {
      setLoading(false)
    }
  }

  async function submit({ email, password }: { email: string; password: string }) {
    setSubmitError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate(destination, { replace: true })
    } catch (err) {
      const message =
        err instanceof AxiosError
          ? (err.response?.data?.error ?? t('auth.signInFailed'))
          : err instanceof Error
            ? err.message
            : t('common.somethingWentWrong')
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
          <form onSubmit={f.handleSubmit(submit)} className="space-y-4" noValidate>
            <FormField id="email" label={t('auth.workEmail')} error={f.errors.email}>
              <Input
                {...f.register('email')}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t('auth.emailPlaceholder')}
                disabled={loading}
              />
            </FormField>
            <FormField id="password" label={t('auth.password')} error={f.errors.password}>
              <Input
                {...f.register('password')}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={loading}
              />
            </FormField>

            <FormAlert>{submitError}</FormAlert>

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
