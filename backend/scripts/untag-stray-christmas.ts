/**
 * Clear the `christmas` tag from anything that is not part of the Christmas
 * range.
 *
 * The first bundle seed tagged whatever catalogue merch it happened to pick for
 * its placeholder boxes. Those boxes are gone, but the tag stayed, so the
 * landing page filled up with power banks. Only what came from the marketing
 * site's Christmas category belongs under that tag.
 */
import { rawSql } from '../src/db/index.js'

async function main() {
  const rows = (await rawSql`
    SELECT id, name FROM products
     WHERE tags @> '["christmas"]'::jsonb
       AND source_id <> 'biglittlethings'
  `) as { id: string; name: string }[]

  if (rows.length === 0) {
    console.log('Nothing to untag.')
    return
  }

  await rawSql`
    UPDATE products
       SET tags = (
         SELECT COALESCE(jsonb_agg(tag), '[]'::jsonb)
           FROM jsonb_array_elements(tags) AS tag
          WHERE tag <> '"christmas"'::jsonb
       )
     WHERE tags @> '["christmas"]'::jsonb
       AND source_id <> 'biglittlethings'
  `
  console.log(`Untagged ${rows.length} products:`)
  for (const r of rows) console.log('  ', r.name)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Untag failed:', err)
    process.exit(1)
  })
