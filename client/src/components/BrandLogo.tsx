import { Link } from 'react-router-dom'
import { useBrand } from '@/context/BrandContext'
import { resolveLogoKind, sanitizeSvgMarkup } from '@/lib/logo'
import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
}

const logoBoxClass =
  'h-8 max-w-[10rem] shrink-0 [&_svg]:h-full [&_svg]:max-h-8 [&_svg]:w-auto [&_svg]:max-w-[10rem]'

export function BrandLogo({ className }: BrandLogoProps) {
  const { brand } = useBrand()
  const kind = resolveLogoKind(brand.logo, brand.logoType)
  const alt = brand.companyName

  return (
    <Link
      to="/"
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
          <span className="truncate font-display text-xl font-bold tracking-tight">
            {brand.companyName}
          </span>
        </>
      )}

      {kind === 'svg' && brand.logo && (
        <span
          className={cn('inline-flex items-center', logoBoxClass)}
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
          className={cn('h-8 w-auto max-w-[10rem] object-contain', logoBoxClass)}
        />
      )}
    </Link>
  )
}
