/**
 * Apply a hand-written DDL file from `sql/`.
 *
 * The Neon HTTP driver sends one statement per request, so the file is split
 * and replayed in order. Every statement in `sql/` is written to be safe to
 * re-run (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`), which is what makes
 * replaying the whole file the normal way to apply it.
 *
 *   pnpm sql sql/funnel.sql
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { rawSql } from '../src/db/index.js'

const file = process.argv[2]
if (!file) {
  console.error('Usage: pnpm sql <path-to-sql-file>')
  process.exit(1)
}

/** Split on semicolons that end a statement, ignoring those inside quotes. */
function statements(sql: string): string[] {
  const out: string[] = []
  let current = ''
  let inSingle = false
  let inLineComment = false

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (inLineComment) {
      current += ch
      if (ch === '\n') inLineComment = false
      continue
    }
    if (!inSingle && ch === '-' && next === '-') {
      inLineComment = true
      current += ch
      continue
    }
    if (ch === "'") inSingle = !inSingle
    if (ch === ';' && !inSingle) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) out.push(current)

  return out
    .map((s) =>
      s
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean)
}

async function run() {
  const full = path.resolve(process.cwd(), file)
  const sql = readFileSync(full, 'utf-8')
  const parts = statements(sql)
  console.log(`Applying ${parts.length} statement(s) from ${file}\n`)

  for (const [i, statement] of parts.entries()) {
    const label = statement.replace(/\s+/g, ' ').slice(0, 90)
    try {
      await rawSql.query(statement)
      console.log(`  ${i + 1}. ok   ${label}`)
    } catch (err) {
      console.error(`  ${i + 1}. FAIL ${label}`)
      throw err
    }
  }
  console.log('\nDone.')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nApply failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
