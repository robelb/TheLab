import cors from 'cors'
import express from 'express'
import { extractRouter } from './routes/extract.js'
import { productsRouter } from './routes/products.js'

export function createApp() {
  const app = express()

  app.use(cors({ origin: true }))
  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api/products', productsRouter)
  app.use('/api/extract', extractRouter)

  return app
}
