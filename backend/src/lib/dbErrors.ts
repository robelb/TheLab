/**
 * Turning database failures into something a person can act on.
 *
 * Drizzle wraps every driver error in "Failed query: <the whole SQL> params:
 * <every value>", and the routers were handing that message straight to the
 * screen — so a slug somebody had already used surfaced as a paragraph of
 * INSERT. The Postgres error underneath knows exactly what went wrong; these
 * dig it out.
 */

interface PgErrorFields {
  code?: string
  constraint?: string
  detail?: string
}

/** The Postgres error under whatever wrapped it, if there is one. */
function pgErrorOf(err: unknown): PgErrorFields | null {
  let current: unknown = err
  // Drizzle → driver is one hop; allow a couple more for anything in between.
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const fields = current as PgErrorFields & { cause?: unknown }
    if (typeof fields.code === 'string' && /^[0-9A-Z]{5}$/.test(fields.code)) {
      return fields
    }
    current = fields.cause
  }
  return null
}

/** A unique index refused the write — optionally, one particular index. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const pg = pgErrorOf(err)
  if (pg?.code !== '23505') return false
  if (!constraint) return true
  // The constraint name is the reliable signal; the detail line is the
  // fallback for drivers that leave it off.
  return (
    pg.constraint === constraint ||
    Boolean(pg.detail && pg.detail.includes(`(${constraint})`))
  )
}

/**
 * The message safe to show a client.
 *
 * An error that came out of a query is never shown as-is: it carries the SQL
 * and every parameter bound to it. Anything else keeps its own message.
 */
export function publicErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback
  if (pgErrorOf(err) || err.message.startsWith('Failed query:')) return fallback
  return err.message
}
