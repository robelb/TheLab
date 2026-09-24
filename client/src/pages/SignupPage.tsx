import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
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
import { FormAlert, FormField } from '@/components/ui/form-field'
import { useZodForm } from '@/lib/form'
import { makeSignupSchema } from '@/lib/schemas/auth'
import { Loader2, Sparkles } from 'lucide-react'

export function SignupPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { signup, isAuthenticated } = useAuth()
  const schema = useMemo(
    () => makeSignupSchema(t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language],
  )
  const f = useZodForm({
    schema,
    initialValues: { name: '', email: '', password: '' },
  })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  async function submit({
    name,
    email,
    password,
  }: {
    name: string
    email: string
    password: string
  }) {
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
          <form onSubmit={f.handleSubmit(submit)} className="space-y-4" noValidate>
            <FormField id="name" label={t('auth.fullName')} error={f.errors.name}>
              <Input
                {...f.register('name')}
                autoComplete="name"
                placeholder={t('auth.namePlaceholder')}
                disabled={loading}
              />
            </FormField>
            <FormField
              id="email"
              label={t('auth.workEmail')}
              error={f.errors.email}
              hint={t('auth.workEmailHint')}
            >
              <Input
                {...f.register('email')}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t('auth.emailPlaceholder')}
                disabled={loading}
              />
            </FormField>
            <FormField
              id="password"
              label={t('auth.password')}
              error={f.errors.password}
              hint={t('auth.passwordPlaceholder')}
            >
              <Input
                {...f.register('password')}
                type="password"
                autoComplete="new-password"
                disabled={loading}
              />
            </FormField>

            <FormAlert>{submitError}</FormAlert>

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
