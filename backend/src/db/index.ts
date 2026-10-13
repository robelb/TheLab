import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../config/env.js'
import * as schema from './schema/index.js'

/**
 * The database connection, behind one switch: `DATABASE_DRIVER`.
 *
 * - `neon-http` (default): Neon's HTTP driver. One HTTPS request per query, no
 *   connection to keep alive — what Neon recommends for short-lived servers.
 *   No interactive transactions.
 * - `postgres`: a plain connection pool (node-postgres). Works with any
 *   Postgres — Cloud SQL, Neon's pooled endpoint, Supabase, a local one — and
 *   has real transactions.
 *
 * The rest of the app only ever sees `db` (Drizzle), `rawSql` (tagged-template
 * SQL for the few hand-written queries) and `atomic` (several writes that must
 * all happen or none), so moving databases is this file and an env var.
 *
 * Both drivers time out, so a database that stops answering fails a request
 * rather than hanging it — and everything queued behind it.
 */

export type DatabaseDriver = 'neon-http' | 'postgres'

/** Longest a single query may take before it is abandoned. */
const QUERY_TIMEOUT_MS = 15_000

function driverFromEnv(): DatabaseDriver {
  const value = (process.env.DATABASE_DRIVER ?? '').trim().toLowerCase()
  if (!value || value === 'neon-http' || value === 'neon') return 'neon-http'
  if (value === 'postgres' || value === 'pg' || value === 'node-postgres') return 'postgres'
  throw new Error(`DATABASE_DRIVER must be "neon-http" or "postgres", not "${value}".`)
}

export const databaseDriver: DatabaseDriver = driverFromEnv()

/**
 * Hand-written SQL as a tagged template: values become bound parameters, and
 * `rawSql.unsafe(text)` splices trusted SQL in as-is. Resolves to the rows.
 */
export interface RawSql {
  <Row = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]>
  /** Trusted SQL text, inserted verbatim — never anything a request supplied. */
  unsafe(text: string): unknown
  /** A whole statement with `$1`-style parameters, e.g. a migration file. */
  query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>
}

/** A piece of SQL spliced in verbatim by the `postgres` driver's `rawSql`. */
class UnsafeSql {
  constructor(readonly text: string) {}
}

export function postgresRawSql(pool: Pick<pg.Pool, "query">): RawSql {
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0]
    const params: unknown[] = []
    values.forEach((value, i) => {
      if (value instanceof UnsafeSql) {
        text += value.text
      } else {
        params.push(value)
        text += `$${params.length}`
      }
      text += strings[i + 1]
    })
    return pool.query(text, params).then((r) => r.rows)
  }
  return Object.assign(tag, {
    unsafe: (text: string) => new UnsafeSql(text),
    query: (text: string, params?: unknown[]) => pool.query(text, params).then((r) => r.rows),
  }) as RawSql
}

function connect() {
  if (databaseDriver === 'postgres') {
    // Neon puts `channel_binding=require` in its URLs; node-postgres takes
    // that as an option of its own rather than from the string.
    const url = new URL(env.DATABASE_URL)
    const channelBinding = url.searchParams.get('channel_binding') === 'require'
    url.searchParams.delete('channel_binding')
    const pool = new pg.Pool({
      connectionString: url.toString(),
      ...(channelBinding ? { enableChannelBinding: true } : {}),
      max: Number(process.env.DATABASE_POOL_SIZE) || 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      // Server side, so a stuck query is cancelled rather than left running.
      statement_timeout: QUERY_TIMEOUT_MS,
      query_timeout: QUERY_TIMEOUT_MS + 2_000,
    })
    // An idle connection the database dropped must not take the process down.
    pool.on('error', (err) => console.warn('[db] idle connection error:', err.message))
    const db = drizzlePostgres(pool, { schema })
    return {
      // Typed as the default driver's: both are Drizzle Postgres databases with
      // the same query builder; `atomic` covers the one place they differ.
      db: db as unknown as ReturnType<typeof drizzleNeonHttp<typeof schema>>,
      rawSql: postgresRawSql(pool),
      close: () => pool.end(),
    }
  }

  // Every query is one fetch; without a deadline a fetch the network lost
  // waits for minutes, and so does the request behind it.
  neonConfig.fetchFunction = (input: string | URL, init?: RequestInit) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) })
  const sql = neon(env.DATABASE_URL)
  return {
    db: drizzleNeonHttp(sql, { schema }),
    rawSql: sql as unknown as RawSql,
    close: async () => {},
  }
}

const connection = connect()

export const db = connection.db
export const rawSql = connection.rawSql

export type Database = typeof db

/** Close the pool on shutdown (nothing to close for the HTTP driver). */
export const closeDatabase = connection.close

type Statement = Parameters<Database['batch']>[0][number]

/**
 * Several writes that must all happen or none — e.g. replacing a box's
 * contents (delete the old rows, insert the new).
 *
 * Built against the executor handed in, so each driver can run them its own
 * way: Neon's HTTP driver sends them as one batch (it has no interactive
 * transactions); a pool runs them inside a transaction.
 */
export async function atomic(build: (q: Database) => Statement[]): Promise<void> {
  if (databaseDriver === 'neon-http') {
    const statements = build(db)
    if (statements.length === 0) return
    await db.batch(statements as [Statement, ...Statement[]])
    return
  }
  const pool = db as unknown as ReturnType<typeof drizzlePostgres<typeof schema>>
  await pool.transaction(async (tx) => {
    for (const statement of build(tx as unknown as Database)) await statement
  })
}
