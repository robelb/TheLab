import { toast } from 'sonner'

/**
 * What went wrong, in the server's own words where it gave any.
 *
 * Every write in the dashboard was unpicking the same axios shape by hand, and
 * the ones that forgot fell back to "Request failed with status code 403" —
 * which tells the person nothing they can act on. The API answers with a
 * sentence; this is how it reaches them.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response
      ?.data
    if (data?.error) return data.error
  }
  if (err instanceof Error && err.message && !/^Request failed/.test(err.message)) {
    return err.message
  }
  return fallback
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
