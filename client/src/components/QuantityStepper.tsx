import { useState, type Dispatch, type SetStateAction } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { MAX_LINE_QUANTITY } from '@/lib/pricing'
import { cn } from '@/lib/utils'

interface QuantityStepperProps {
  value: number
  /** A state setter: steps are applied as updates, so fast clicks all count. */
  onChange: Dispatch<SetStateAction<number>>
  /** The supplier's minimum order; the stepper will not go below it. */
  min?: number
  /** The most it goes up to — by default what the server takes on one line. */
  max?: number
  /** For a `<label htmlFor>` outside the stepper. */
  id?: string
  className?: string
}

/**
 * − n + next to a buy button. The number is typed into as well, so an order of
 * 250 boxes is not 250 clicks.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = MAX_LINE_QUANTITY,
  id,
  className,
}: QuantityStepperProps) {
  const { t } = useTranslation()
  // What is in the field while someone is typing. Held apart from `value` so
  // the field can be empty mid-edit; only a whole number at or above `min`
  // reaches the caller — capped at `max` — and leaving the field shows the
  // real quantity again.
  const [draft, setDraft] = useState<string | null>(null)

  function handleType(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, String(max).length)
    const n = Number.parseInt(digits, 10)
    if (n > max) {
      setDraft(String(max))
      onChange(max)
      return
    }
    setDraft(digits)
    if (n >= min) onChange(n)
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center rounded-brand border border-border',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-8 rounded-none"
        aria-label={t('cart.decrease')}
        disabled={value <= min}
        onClick={() => {
          setDraft(null)
          onChange((q) => Math.max(min, Math.min(max, q - 1)))
        }}
      >
        <Minus className="size-4" />
      </Button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={id ? undefined : t('cart.quantity')}
        value={draft ?? String(value)}
        onChange={(e) => handleType(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => setDraft(null)}
        className="h-9 w-14 bg-transparent text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-8 rounded-none"
        aria-label={t('cart.increase')}
        disabled={value >= max}
        onClick={() => {
          setDraft(null)
          onChange((q) => Math.min(max, q + 1))
        }}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
