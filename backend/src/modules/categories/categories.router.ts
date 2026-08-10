import { asc } from 'drizzle-orm'
import { Router } from 'express'
import { db } from '../../db/index.js'
import { categories } from '../../db/schema/index.js'
import { isSupplyCategory } from '../../lib/supplies.js'

export const categoriesRouter = Router()

categoriesRouter.get('/', async (_req, res) => {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
    })
    .from(categories)
    .orderBy(asc(categories.name))

  // Supply categories stay assignable from the dashboard; the flag just tells
  // the client these are box-building materials, not shop categories.
  res.json({
    data: rows.map((c) => ({ ...c, isSupply: isSupplyCategory(c.slug) })),
  })
})
