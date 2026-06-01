import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

config({ path: path.resolve(__dirname, '../.env') })

const PORT = Number(process.env.PORT) || 3001
const app = createApp()

app.listen(PORT, () => {
  console.log(`TheLab API http://localhost:${PORT}`)
  console.log('  GET  /api/health')
  console.log('  GET  /api/products?page=1&limit=12')
  console.log('  POST /api/extract  { "domain": "airbnb.com" }')
})
