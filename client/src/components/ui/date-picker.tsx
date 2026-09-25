import { useState } from 'react'
import { CalendarIcon, X } from 'lucide-react'
import { de, enGB } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { currentLocale } from '@/i18n'
import { cn } from '@/lib/utils'

/** `YYYY-MM-DD` → a local date, or undefined for anything else. */
function parseIso(value: string | undefined): Date | undefined {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null
  if (!match) return undefined
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * A date field: a button showing the date, opening a calendar.
 *
 * Speaks the same `YYYY-MM-DD` string an `<input type="date">` did — `''` for
 * no date — so forms and the API keep their values as they were. Shown and
 * laid out in the language the site is in.
 */
export function DatePicker({
  id,
  value,
  onChange,
  onBlur,
  min,
  max,
  placeholder,
  clearable = false,
  disabled,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  /** Called when the calendar closes — where a text input would have blurred. */
  onBlur?: () => void
  /** Earliest pickable day, `YYYY-MM-DD`. */
  min?: string
  /** Latest pickable day, `YYYY-MM-DD`. */
  max?: string
  placeholder?: string
  /** Offer a way back to no date, for optional fields. */
  clearable?: boolean
  disabled?: boolean
  className?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-required'?: boolean
}) {
  const [open, setOpen] = useState(false)
  const locale = currentLocale()
  const selected = parseIso(value)
  const minDate = parseIso(min)
  const maxDate = parseIso(max)
  const label = selected
    ? new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(selected)
    : (placeholder ?? (locale === 'de' ? 'Datum wählen' : 'Pick a date'))

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onBlur?.()
      }}
    >
      <div className={cn('relative', className)}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            aria-required={ariaRequired}
            // Looks like the text inputs beside it, not like a button.
            className={cn(
              'h-10 w-full justify-start rounded-brand border-input bg-background/50 px-3 text-left font-normal text-foreground hover:bg-background/50',
              !selected && 'text-muted-foreground',
              clearable && selected && 'pr-9',
              ariaInvalid && 'border-destructive',
            )}
          >
            <CalendarIcon className="size-4 opacity-60" />
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        {clearable && selected && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={locale === 'de' ? 'Datum entfernen' : 'Clear date'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={locale === 'de' ? de : enGB}
          selected={selected}
          defaultMonth={selected ?? minDate}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
          onSelect={(date) => {
            if (!date) return
            onChange(toIso(date))
            setOpen(false)
            onBlur?.()
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
