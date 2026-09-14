import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { Loader2, Sparkles } from 'lucide-react'

export function SignupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { signup, isAuthenticated } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setLoading(true)
    try {
      await signup(name, email, password)
      navigate('/', { replace: true })
    } catch (err) {
      const message =
        err instanceof AxiosError
          ? (err.response?.data?.error ?? t('auth.createFailed'))
          : err instanceof Error
            ? err.message
            : t('common.somethingWentWrong')
      setSubmitError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
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
            {t('auth.createTitle')}
          </CardTitle>
          <CardDescription>{t('auth.createIntro')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('auth.fullName')}</Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                placeholder={t('auth.namePlaceholder')}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setSubmitError(null)
                }}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.workEmail')}</Label>
              <Input
                id="email"
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
                type="password"
                autoComplete="new-password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setSubmitError(null)
                }}
                disabled={loading}
                required
                minLength={8}
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
                  {t('auth.settingUp')}
                </>
              ) : (
                t('auth.createAccount')
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              {t('auth.brandNote')}
            </p>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t('auth.signIn')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
