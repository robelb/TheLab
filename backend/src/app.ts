import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractRouter } from './modules/extract/extract.router.js'
import { productsRouter } from './modules/products/products.router.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()

  app.use(cors({ origin: true }))
  app.use(express.json())

  app.use(
    '/api/customized',
    express.static(path.join(__dirname, '../public/customized')),
  )

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api/products', productsRouter)
  app.use('/api/extract', extractRouter)

  return app
}
