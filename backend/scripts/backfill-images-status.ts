import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

const { rawSql } = await import('../src/db/index.js')

const before = (await rawSql`
  SELECT images_status, count(*)::int AS n FROM companies GROUP BY images_status ORDER BY images_status
`) as Array<{ images_status: string; n: number }>
console.log('BEFORE:', before.map((r) => `${r.images_status}=${r.n}`).join(', ') || '(none)')

// Pre-existing companies were defaulted to 'pending' when the column was added,
// but nothing is generating for them. Give them a terminal status so the client
// stops polling / showing the toast: 'ready' if they have branded images,
// otherwise 'skipped'.
const ready = (await rawSql`
  UPDATE companies SET images_status = 'ready'
  WHERE images_status = 'pending'
    AND EXISTS (SELECT 1 FROM brand_customizations bc WHERE bc.company_id = companies.id)
  RETURNING id
`) as Array<{ id: string }>

const skipped = (await rawSql`
  UPDATE companies SET images_status = 'skipped'
  WHERE images_status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM brand_customizations bc WHERE bc.company_id = companies.id)
  RETURNING id
`) as Array<{ id: string }>

console.log(`backfilled → ready: ${ready.length}, skipped: ${skipped.length}`)

const after = (await rawSql`
  SELECT images_status, count(*)::int AS n FROM companies GROUP BY images_status ORDER BY images_status
`) as Array<{ images_status: string; n: number }>
console.log('AFTER:', after.map((r) => `${r.images_status}=${r.n}`).join(', ') || '(none)')
