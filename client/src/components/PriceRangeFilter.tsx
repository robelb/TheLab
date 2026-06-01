import { useMemo } from 'react'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

interface PriceRangeFilterProps {
  bounds: { min: number; max: number }
  value: [number, number]
  onChange: (value: [number, number]) => void
  className?: string
}

function formatPrice(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

function sliderStep(min: number, max: number): number {
  const span = max - min
  if (span <= 10) return 0.01
  if (span <= 100) return 0.1
  return 1
}

export function PriceRangeFilter({
  bounds,
  value,
  onChange,
  className,
}: PriceRangeFilterProps) {
  const step = useMemo(
    () => sliderStep(bounds.min, bounds.max),
    [bounds.min, bounds.max],
  )

  const isFullRange =
    value[0] <= bounds.min && value[1] >= bounds.max

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground tabular-nums">
          {formatPrice(value[0])}
        </span>
        <span className="text-muted-foreground">–</span>
        <span className="font-medium text-foreground tabular-nums">
          {formatPrice(value[1])}
        </span>
      </div>
      <Slider
        min={bounds.min}
        max={bounds.max}
        step={step}
        minStepsBetweenThumbs={0}
        value={value}
        onValueChange={(next) => {
          if (next.length >= 2) onChange([next[0], next[1]])
        }}
        aria-label="Price range"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{formatPrice(bounds.min)}</span>
        <span>{formatPrice(bounds.max)}</span>
      </div>
      {!isFullRange && (
        <p className="text-[10px] text-muted-foreground">Filtered range</p>
      )}
    </div>
  )
}

export function isPriceRangeFiltered(
  bounds: { min: number; max: number },
  value: [number, number],
): boolean {
  return value[0] > bounds.min || value[1] < bounds.max
}

export function formatPriceRangeLabel(
  bounds: { min: number; max: number },
  value: [number, number],
): string {
  const min = formatPrice(value[0])
  const max = formatPrice(value[1])
  if (value[0] > bounds.min && value[1] < bounds.max) return `${min} – ${max}`
  if (value[0] > bounds.min) return `From ${min}`
  return `Up to ${max}`
}
