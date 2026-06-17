import { env } from './config/env.js'
import { createApp } from './app.js'
import { isSupabaseStorageConfigured } from './services/supabaseStorage.js'

const app = createApp()

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`TheLab API listening on port ${env.PORT}`)
  // Surfaces which storage backend generated/uploaded images will use. If this
  // says "local disk" in production, Supabase env vars are missing and image
  // URLs will fall back to PUBLIC_API_URL (e.g. localhost) on ephemeral disk.
  if (isSupabaseStorageConfigured()) {
    console.log(`  Image storage: Supabase (bucket=${env.SUPABASE_STORAGE_BUCKET})`)
  } else {
    console.log(`  Image storage: local disk (PUBLIC_API_URL=${env.PUBLIC_API_URL})`)
  }
  console.log('  GET  /api/health')
  console.log('  GET  /api/products?page=1&limit=20')
  console.log('  POST /api/extract  { "domain": "biglittlethings.de" }')
})
