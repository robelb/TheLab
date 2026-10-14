import { toast } from 'sonner'
import i18n from '@/i18n'
import { errorKind } from '@/lib/errors'

/**
 * What went wrong, in the server's own words where it gave any.
 *
 * Every write in the dashboard was unpicking the same axios shape by hand, and
 * the ones that forgot fell back to "Request failed with status code 403" —
 * which tells the person nothing they can act on. The API answers with a
 * sentence; this is how it reaches them.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  // No answer at all: the browser's own wording ("Network Error", "timeout of
  // 220000ms exceeded") says nothing to a person; their connection might.
  const kind = errorKind(err)
  if (kind === 'offline' || kind === 'network') return i18n.t('errors.NETWORK')
  if (kind === 'rateLimited') return i18n.t('errors.RATE_LIMITED')
  const data = responseData(err)
  // A raw database error ("Failed query: insert into …") is never something
  // to put in front of a person, whichever endpoint let it through.
  if (data?.error && !isQueryDump(data.error)) return data.error
  if (
    err instanceof Error &&
    err.message &&
    !/^Request failed/.test(err.message) &&
    !isQueryDump(err.message)
  ) {
    return err.message
  }
  return fallback
}

/**
 * Which form field the server says the error is about, when it said.
 *
 * Lets a form put the message under the input that needs changing instead of
 * only at the bottom.
 */
export function apiErrorField(err: unknown): string | undefined {
  return responseData(err)?.field
}

function responseData(
  err: unknown,
): { error?: string; field?: string } | undefined {
  if (err && typeof err === 'object' && 'response' in err) {
    return (err as { response?: { data?: { error?: string; field?: string } } })
      .response?.data
  }
  return undefined
}

function isQueryDump(message: string): boolean {
  return /^Failed query:/.test(message)
}

/**
 * Say that a write landed.
 *
 * Worth saying out loud even when the screen already shows the new state: on a
 * page of several sections, a change saved in one of them is easy to miss, and
 * "did that save?" is the question this answers.
 */
export function notifySaved(message: string, description?: string): void {
  toast.success(message, description ? { description } : undefined)
}

/** Say that it did not, and why. */
export function notifyError(err: unknown, fallback: string): void {
  toast.error(apiErrorMessage(err, fallback))
}
