import { env } from './config/env.js'
import { createApp } from './app.js'

const app = createApp()

app.listen(env.PORT, () => {
  console.log(`TheLab API http://localhost:${env.PORT}`)
  console.log('  GET  /api/health')
  console.log('  GET  /api/products?page=1&limit=20')
  console.log('  POST /api/extract  { "domain": "biglittlethings.de" }')
})
