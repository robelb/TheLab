import { Link } from 'react-router-dom'
import { useBrand } from '@/context/BrandContext'
import { resolveLogoKind, sanitizeSvgMarkup } from '@/lib/logo'
import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
  /** Where the logo goes. The shop, unless a campaign owns this visit. */
  to?: string
  /** Fit a 2rem square, e.g. a collapsed sidebar: the initial alone, or the logo shrunk to fit. */
  compact?: boolean
}

const logoBoxClass =
  'h-8 max-w-[10rem] shrink-0 [&_svg]:h-full [&_svg]:max-h-8 [&_svg]:w-auto [&_svg]:max-w-[10rem]'

export function BrandLogo({ className, to = '/', compact = false }: BrandLogoProps) {
  const { brand } = useBrand()
  const kind = resolveLogoKind(brand.logo, brand.logoType)
  const alt = brand.companyName

  return (
    <Link
      to={to}
      aria-label={compact ? alt : undefined}
      className={cn('flex min-w-0 items-center gap-3 text-foreground', className)}
    >
      {kind === 'none' && (
        <>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-brand bg-primary text-sm font-bold text-primary-foreground"
            aria-hidden
          >
            {brand.companyName.charAt(0)}
          </span>
          {!compact && (
            <span className="truncate font-display text-xl font-bold tracking-tight">
              {brand.companyName}
            </span>
          )}
        </>
      )}

      {kind === 'svg' && brand.logo && (
        <span
          className={cn(
            'inline-flex items-center',
            logoBoxClass,
            compact && 'max-w-8 [&_svg]:max-w-8',
          )}
          role="img"
          aria-label={alt}
          dangerouslySetInnerHTML={{
            __html: sanitizeSvgMarkup(brand.logo),
          }}
        />
      )}

      {(kind === 'url' || kind === 'data-uri') && brand.logo && (
        <img
          src={brand.logo}
          alt={alt}
          className={cn(
            'h-8 w-auto max-w-[10rem] object-contain',
            logoBoxClass,
            compact && 'max-w-8',
          )}
        />
      )}
    </Link>
  )
}
