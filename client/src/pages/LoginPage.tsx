import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { domainInputSchema } from '@/lib/domainSchema'
import { useAuth } from '@/context/AuthContext'
import { useBrand } from '@/context/BrandContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, Sparkles } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, loginWithDefault, isAuthenticated } = useAuth()
  const { selectBrand } = useBrand()
  const [domain, setDomain] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true })
      return
    }
    selectBrand('airbnb')
  }, [isAuthenticated, navigate, selectBrand])

  function handleDefaultLogin() {
    setSubmitError(null)
    loginWithDefault()
    navigate('/', { replace: true })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)
    setSubmitError(null)

    const parsed = domainInputSchema.safeParse({ domain })
    if (!parsed.success) {
      setFieldError(
        parsed.error.flatten().fieldErrors.domain?.[0] ?? 'Invalid domain',
      )
      return
    }

    setLoading(true)
    try {
      await login(domain)
      navigate('/', { replace: true })
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Something went wrong',
      )
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
            Welcome to the shop
          </CardTitle>
          <CardDescription>
            Browse with the Airbnb demo theme, or enter a company domain to
            extract and apply their brand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button
            type="button"
            className="w-full"
            size="lg"
            disabled={loading}
            onClick={handleDefaultLogin}
          >
            Continue with Airbnb demo
          </Button>

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              or use a custom domain
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="domain">Company domain</Label>
              <div className="flex rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="flex items-center border-r border-input px-3 text-sm text-muted-foreground">
                  https://
                </span>
                <Input
                  id="domain"
                  name="domain"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="biglittlethings.de"
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value)
                    setFieldError(null)
                    setSubmitError(null)
                  }}
                  disabled={loading}
                  className="border-0 shadow-none focus-visible:ring-0 focus-visible:rounded-l-none m-1"
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? 'domain-error' : undefined}
                />
              </div>
              {fieldError && (
                <p id="domain-error" className="text-sm text-destructive">
                  {fieldError}
                </p>
              )}
            </div>

            {submitError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {submitError}
              </p>
            )}

            <Button
              type="submit"
              variant="outline"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Extracting brand…
                </>
              ) : (
                'Open shop with custom brand'
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Custom brands may take 30–90 seconds while we analyze the site and
              apply your logo to featured products.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
