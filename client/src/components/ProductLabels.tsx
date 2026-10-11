import { Leaf, Sprout } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { ProductLabel } from '@/types/product'

const ICONS: Record<ProductLabel, typeof Leaf> = {
  vegan: Sprout,
  organic: Leaf,
}

/**
 * A product's diet and sourcing badges — vegan, organic ("Bio"). They come
 * from Endeavour's tags and the "Snacks 2026" sheet. Renders nothing for a
 * product without any.
 */
export function ProductLabels({
  labels,
  size = 'sm',
  className,
}: {
  labels: ProductLabel[] | undefined
  size?: 'sm' | 'md'
  className?: string
}) {
  const { t } = useTranslation()
  if (!labels?.length) return null
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label={t('stepBuilder.labels.title')}>
      {labels.map((label) => {
        const Icon = ICONS[label]
        return (
          <li
            key={label}
            className={cn(
              'flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 font-medium text-foreground',
              size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]',
            )}
          >
            {Icon && <Icon className={cn('text-primary', size === 'md' ? 'size-4' : 'size-3')} />}
            {t(`stepBuilder.labels.${label}`)}
          </li>
        )
      })}
    </ul>
  )
}
