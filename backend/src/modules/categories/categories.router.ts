import { asc } from 'drizzle-orm'
import { Router } from 'express'
import { db } from '../../db/index.js'
import { categories } from '../../db/schema/index.js'

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

  res.json({ data: rows })
})
