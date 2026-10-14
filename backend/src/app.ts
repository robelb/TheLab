import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
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
import { themeRouter } from './modules/theme/theme.router.js'
import { uploadsRouter } from './modules/uploads/uploads.router.js'
import { usersRouter } from './modules/users/users.router.js'
import { internalRouter } from './modules/internal/internal.router.js'
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
  app.use('/api/theme', themeRouter)
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
  app.use('/internal', internalRouter)

  // Anything else under the API is a JSON 404, not Express's HTML page.
  app.use(['/api', '/internal'], (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' })
  })

  // The last word on errors a route did not catch itself: a body too large or
  // not JSON is the caller's mistake (4xx); anything else is ours (500), with
  // the details in the log rather than in the response.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err)
    const e = err as { status?: number; statusCode?: number; type?: string; message?: string }
    const status = e.status ?? e.statusCode ?? 500
    if (status >= 400 && status < 500) {
      const error =
        e.type === 'entity.too.large'
          ? 'The request is too large.'
          : e.type === 'entity.parse.failed'
            ? 'The request body is not valid JSON.'
            : 'Invalid request'
      res.status(status).json({ error })
      return
    }
    console.error(`[app] ${req.method} ${req.path} failed:`, e.message ?? err)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  })

  return app
}
