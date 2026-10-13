import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './config/env.js'
import { corsOrigins, securityHeaders } from './middleware/securityHeaders.js'
import { authRouter } from './modules/auth/auth.router.js'
import { campaignsRouter } from './modules/campaigns/campaigns.router.js'
import { categoriesRouter } from './modules/categories/categories.router.js'
import { collectionsRouter } from './modules/collections/collections.router.js'
import { companiesRouter } from './modules/companies/companies.router.js'
import { composeRouter } from './modules/compose/compose.router.js'
import { dashboardRouter } from './modules/dashboard/dashboard.router.js'
import { designsRouter } from './modules/designs/designs.router.js'
import { extractRouter } from './modules/extract/extract.router.js'
import { ordersRouter } from './modules/orders/orders.router.js'
import { productsRouter } from './modules/products/products.router.js'
import { shareRouter } from './modules/share/share.router.js'
import { systemInstructionsRouter } from './modules/system-instructions/system-instructions.router.js'
import { settingsRouter } from './modules/settings/settings.router.js'
import { uploadsRouter } from './modules/uploads/uploads.router.js'
import { usersRouter } from './modules/users/users.router.js'
import { UPLOADS_DIR, VIDEOS_DIR } from './modules/uploads/uploads.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()
  app.set('trust proxy', env.TRUST_PROXY_HOPS)
  app.disable('x-powered-by')

  app.use(securityHeaders)
  app.use(cors({ origin: corsOrigins() }))

  // Images travel as base64 to these, so their bodies are large; everything
  // else is held to a size no legitimate request comes near. The first parser
  // that matches a path is the one that reads the body.
  const largeJson = express.json({ limit: '15mb' })
  for (const prefix of ['/api/uploads', '/api/products', '/api/compose', '/api/campaigns', '/api/share']) {
    app.use(prefix, largeJson)
  }
  app.use(express.json({ limit: '2mb' }))

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
  app.use('/api/collections', collectionsRouter)
  app.use('/api/compose', composeRouter)
  app.use('/api/orders', ordersRouter)
  // Nested under products for listing, addressed by id once saved — so it owns
  // the `/api` prefix rather than a segment of its own.
  app.use('/api', designsRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/campaigns', campaignsRouter)
  app.use('/api/uploads', uploadsRouter)
  app.use('/api/extract', extractRouter)
  app.use('/api/share', shareRouter)
  app.use('/api/system-instructions', systemInstructionsRouter)
  app.use('/api/settings', settingsRouter)

  return app
}
