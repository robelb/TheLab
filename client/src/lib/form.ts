import { useCallback, useMemo, useState, type FormEvent } from 'react'
import type { z } from 'zod'

/** One message per field, keyed by the field's name (`a.b` when nested). */
export type FormErrors = Record<string, string>

/** The first message Zod has for each field — one thing to fix at a time. */
export function collectErrors(error: z.ZodError): FormErrors {
  const out: FormErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !(key in out)) out[key] = issue.message
  }
  return out
}

function isFilled(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  return value !== undefined && value !== null && value !== false
}

/**
 * A form's values, checked against a Zod schema.
 *
 * When an error shows is what decides whether a form feels helpful or like it
 * is telling you off:
 *
 * - Nothing is flagged while someone is still filling a field in for the first
 *   time. Leaving a field they typed into checks it; tabbing past an empty one
 *   does not — being told "required" about the field you were just getting to
 *   reads as nagging.
 * - Sending checks everything, shows every problem at once, and moves the
 *   cursor to the first one so nobody has to hunt for it.
 * - Once a field shows an error, it is re-checked on every keystroke, so the
 *   message goes away the moment it is fixed.
 *
 * The schema is the one source of truth: the same object that decides the
 * errors also produces the cleaned-up data `onValid` receives.
 */
export function useZodForm<T extends object, Out = T>({
  schema,
  initialValues,
  idPrefix = '',
}: {
  /**
   * Checks the values and produces `Out`. Its input type is not tied to `T`:
   * a form often holds more than it validates (a bundle's contents editor
   * state, say), and the values' type comes from `initialValues`.
   */
  schema: z.ZodType<Out, z.ZodTypeDef, unknown>
  initialValues: T | (() => T)
  /** Keeps ids unique when two forms with the same field names share a page. */
  idPrefix?: string
}) {
  const [values, setValues] = useState<T>(initialValues)
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set())
  const [submitted, setSubmitted] = useState(false)

  const allErrors = useMemo<FormErrors>(() => {
    const result = schema.safeParse(values)
    return result.success ? {} : collectErrors(result.error)
  }, [schema, values])

  const errors = useMemo<FormErrors>(() => {
    if (submitted) return allErrors
    const out: FormErrors = {}
    for (const [key, message] of Object.entries(allErrors)) {
      if (shown.has(key)) out[key] = message
    }
    return out
  }, [allErrors, shown, submitted])

  const reveal = useCallback((name: string) => {
    setShown((prev) => (prev.has(name) ? prev : new Set(prev).add(name)))
  }, [])

  const set = useCallback(<K extends keyof T & string>(name: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }, [])

  const idOf = useCallback((name: string) => `${idPrefix}${name}`, [idPrefix])

  /** Props for an `<Input>` or `<Textarea>` bound to one field. */
  const register = useCallback(
    <K extends keyof T & string>(name: K) => {
      const id = idOf(name)
      const error = errors[name]
      return {
        id,
        name,
        value: (values[name] ?? '') as string,
        onChange: (e: { target: { value: string } }) => set(name, e.target.value as T[K]),
        onBlur: () => {
          if (isFilled(values[name])) reveal(name)
        },
        'aria-invalid': error ? true : undefined,
        // Points at whichever of the two `FormField` is rendering.
        'aria-describedby': error ? `${id}-error` : `${id}-hint`,
      }
    },
    [errors, idOf, reveal, set, values],
  )

  /** Props for a `<Checkbox>` bound to one boolean field. */
  const registerCheckbox = useCallback(
    <K extends keyof T & string>(name: K) => {
      const id = idOf(name)
      const error = errors[name]
      return {
        id,
        checked: values[name] === true,
        onCheckedChange: (checked: boolean | 'indeterminate') => {
          set(name, (checked === true) as T[K])
          // A tick is a finished answer — no reason to wait for a blur.
          reveal(name)
        },
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-error` : undefined,
      }
    },
    [errors, idOf, reveal, set, values],
  )

  /**
   * Wraps the submit handler: `onValid` only ever runs with data that passed
   * the schema. Otherwise every error is shown and the first one focused.
   */
  const handleSubmit = useCallback(
    (
      onValid: (data: Out) => void | Promise<void>,
      /**
       * Told what failed before the cursor moves — e.g. to open the tab the
       * first problem is on, so there is a field there to move it to.
       */
      onInvalid?: (errors: FormErrors) => void,
    ) =>
      (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setSubmitted(true)
        const result = schema.safeParse(values)
        if (result.success) return onValid(result.data)

        const failed = collectErrors(result.error)
        onInvalid?.(failed)
        const form = e.currentTarget
        // A tick later, so whatever `onInvalid` opened has rendered (React
        // finishes a submit event's render before timers run). In the order
        // fields appear on screen, not the order the schema lists them — the
        // cursor should land on the top-most problem.
        setTimeout(() => {
          const ids = new Set(Object.keys(failed).map(idOf))
          const first = Array.from(form.querySelectorAll<HTMLElement>('[id]')).find((el) =>
            ids.has(el.id),
          )
          first?.focus({ preventScroll: true })
          first?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }, 0)
      },
    [idOf, schema, values],
  )

  /** Back to a clean slate, e.g. when a dialog is closed and reopened. */
  const reset = useCallback((next: T) => {
    setValues(next)
    setShown(new Set())
    setSubmitted(false)
  }, [])

  return {
    values,
    set,
    setValues,
    errors,
    /** How many problems to mention above the button, once they tried to send. */
    errorCount: submitted ? Object.keys(allErrors).length : 0,
    register,
    registerCheckbox,
    handleSubmit,
    reset,
    idOf,
  }
}

/** What `useZodForm` hands back — for components that receive a form as a prop. */
export type ZodForm<T extends object, Out = T> = ReturnType<
  typeof useZodForm<T, Out>
>
