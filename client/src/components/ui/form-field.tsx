import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * A label, the control, and one line under it: the error when there is one,
 * the hint otherwise.
 *
 * The error takes the hint's place rather than stacking under it — one line
 * that says what to do is easier to act on than two. Ids follow the pattern
 * `useZodForm`'s `register` points `aria-describedby` at, so a screen reader
 * reads out whichever line is showing.
 */
export function FormField({
  id,
  label,
  error,
  hint,
  optional,
  optionalLabel = '(optional)',
  className,
  children,
}: {
  id: string
  label: ReactNode
  error?: string
  hint?: ReactNode
  /** Marks the field optional. Required is the default and goes unsaid. */
  optional?: boolean
  optionalLabel?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>
        {label}
        {optional && (
          <span className="font-normal normal-case tracking-normal text-muted-foreground">
            {' '}
            {optionalLabel}
          </span>
        )}
      </Label>
      {children}
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  )
}

/** The line under a control — for controls laid out without `FormField`. */
export function FieldMessage({
  id,
  error,
  hint,
}: {
  id: string
  error?: string
  hint?: ReactNode
}) {
  if (error) {
    return (
      <p
        id={`${id}-error`}
        className="flex items-start gap-1.5 text-xs font-medium text-destructive"
      >
        <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
        {error}
      </p>
    )
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    )
  }
  return null
}

/**
 * A message for the whole form: "please check the fields marked below" after a
 * send that did not pass, or what the server said when it refused.
 */
export function FormAlert({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  )
}
