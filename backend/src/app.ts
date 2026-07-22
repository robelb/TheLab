import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authRouter } from './modules/auth/auth.router.js'
import { campaignsRouter } from './modules/campaigns/campaigns.router.js'
import { categoriesRouter } from './modules/categories/categories.router.js'
import { companiesRouter } from './modules/companies/companies.router.js'
import { dashboardRouter } from './modules/dashboard/dashboard.router.js'
import { extractRouter } from './modules/extract/extract.router.js'
import { productsRouter } from './modules/products/products.router.js'
import { shareRouter } from './modules/share/share.router.js'
import { uploadsRouter } from './modules/uploads/uploads.router.js'
import { usersRouter } from './modules/users/users.router.js'
import { UPLOADS_DIR, VIDEOS_DIR } from './modules/uploads/uploads.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()

  app.use(cors({ origin: true }))
  // Larger limit so base64-encoded image uploads (image search) fit in the body.
  app.use(express.json({ limit: '15mb' }))

  app.use(
    '/api/customized',
    express.static(path.join(__dirname, '../public/customized')),
  )
  app.use('/api/uploads', express.static(UPLOADS_DIR))
  app.use('/api/videos', express.static(VIDEOS_DIR))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/companies', companiesRouter)
  app.use('/api/products', productsRouter)
  app.use('/api/categories', categoriesRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/campaigns', campaignsRouter)
  app.use('/api/uploads', uploadsRouter)
  app.use('/api/extract', extractRouter)
  app.use('/api/share', shareRouter)

  return app
}
