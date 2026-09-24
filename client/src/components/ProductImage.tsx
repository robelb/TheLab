import { useState, type ImgHTMLAttributes } from 'react'
import { Gift } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined
}

/**
 * A product picture that degrades to a placeholder instead of a broken icon.
 *
 * Imported catalogues arrive with images that are missing, moved or hotlink-
 * protected, and a landing page for paid traffic cannot show a torn-paper icon
 * next to a price. The placeholder takes the image's own classes, so it fills
 * exactly the box the picture would have.
 */
export function ProductImage({ src, alt, className, onError, ...rest }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const broken = !src || failedSrc === src

  if (broken) {
    return (
      <div
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={cn(
          className,
          'flex items-center justify-center bg-muted text-muted-foreground/60',
        )}
      >
        <Gift className="size-1/3 max-h-10 max-w-10 min-h-3 min-w-3" strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      className={className}
      onError={(e) => {
        setFailedSrc(src)
        onError?.(e)
      }}
    />
  )
}
