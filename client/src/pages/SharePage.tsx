import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getShare } from '@/api/share'
import { Button } from '@/components/ui/button'
import { resolveLogoKind, sanitizeSvgMarkup } from '@/lib/logo'
import { formatPrice } from '@/utils/format'

/** Renders the shop's logo from a brand snapshot (URL, data URI, or inline SVG). */
function BrandMark({
  logo,
  logoType,
  companyName,
}: {
  logo?: string | null
  logoType?: string | null
  companyName?: string | null
}) {
  const kind = resolveLogoKind(logo, logoType)

  if (kind === 'svg' && logo) {
    return (
      <span
        className="flex h-9 items-center [&_svg]:max-h-9 [&_svg]:w-auto"
        aria-label={companyName ?? 'Logo'}
        dangerouslySetInnerHTML={{ __html: sanitizeSvgMarkup(logo) }}
      />
    )
  }
  if ((kind === 'url' || kind === 'data-uri') && logo) {
    return (
      <img
        src={logo}
        alt={companyName ?? 'Logo'}
        className="h-9 w-auto object-contain"
      />
    )
  }
  return (
    <span className="font-display text-lg font-bold tracking-tight">
      {companyName ?? 'Our Shop'}
    </span>
  )
}

export function SharePage() {
  const { slug } = useParams<{ slug: string }>()
  const {
    data: share,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['share', slug],
    queryFn: () => getShare(slug!),
    enabled: Boolean(slug),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 text-sm text-muted-foreground">
        Loading shared preview…
      </div>
    )
  }

  if (error || !share) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/20 px-6 text-center">
        <h1 className="font-display text-2xl font-bold">Link not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This shared link is invalid or has expired.
        </p>
      </div>
    )
  }

  const accent = share.brand?.primaryColor || undefined
  const companyName = share.brand?.companyName

  return (
    <div
      className="min-h-screen bg-muted/20"
      style={accent ? ({ ['--brand-accent' as string]: accent } as React.CSSProperties) : undefined}
    >
      {/* Branded header — this is "our site", not a bare image URL. */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <BrandMark
            logo={share.brand?.logo}
            logoType={share.brand?.logoType}
            companyName={companyName}
          />
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
            style={
              accent
                ? { borderColor: accent, color: accent }
                : undefined
            }
          >
            <ShieldCheck className="size-3.5" />
            Shared for approval
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          {/* The configured image, presented cleanly. */}
          <div className="overflow-hidden rounded-brand border border-border/40 bg-white shadow-brand">
            <img
              src={share.imageUrl}
              alt={share.title ?? share.product?.name ?? 'Shared product'}
              className="aspect-square w-full object-contain"
            />
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {share.title ?? share.product?.name ?? 'Configured product'}
              </h1>
              {share.product?.tagline && (
                <p className="text-sm text-muted-foreground">
                  {share.product.tagline}
                </p>
              )}
              {share.product && (
                <p
                  className="text-2xl font-semibold"
                  style={accent ? { color: accent } : undefined}
                >
                  {formatPrice(share.product.price, share.product.currency)}
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-brand border border-border/40 bg-background p-3 text-xs text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              <p>
                Someone shared this configured product with you for sign-off.
                Review the design above, then open the shop to place the order
                once it's approved.
              </p>
            </div>

            <Button
              asChild
              className="w-full"
              style={
                accent
                  ? { backgroundColor: accent, borderColor: accent }
                  : undefined
              }
            >
              <Link to={share.product ? `/product/${share.product.id}` : '/'}>
                <ExternalLink className="size-4" />
                Open in shop
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-4xl px-6 pb-10 text-center text-xs text-muted-foreground">
        Powered by {companyName ?? 'our shop'}
      </footer>
    </div>
  )
}
