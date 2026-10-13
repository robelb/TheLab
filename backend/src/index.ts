import { env } from './config/env.js'
import { createApp } from './app.js'
import { isSupabaseStorageConfigured } from './services/supabaseStorage.js'
import { startOutbox, stopOutbox } from './services/outbox.js'
import { closeDatabase, databaseDriver } from './db/index.js'
import { mailTransport } from './services/mail/index.js'
// Imported for their side effect: each registers its outbox handler.
import './services/leadIntake.js'
import './services/mailer.js'
import './modules/orders/orders.emails.js'

// A promise nobody awaited that failed, or an error nobody caught: logged
// loudly rather than lost. An uncaught exception leaves the process in an
// unknown state, so it exits and the host starts a fresh one.
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandled rejection:', reason instanceof Error ? reason.stack : reason)
})
process.on('uncaughtException', (err) => {
  console.error('[process] uncaught exception, exiting:', err.stack ?? err)
  process.exit(1)
})

const app = createApp()

const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`TheLab API listening on port ${env.PORT}`)
  console.log(`  Database: ${databaseDriver}`)
  console.log(`  Email: ${mailTransport.name}${mailTransport.isConfigured() ? '' : ' (not configured — emails are queued only)'}`)
  // Surfaces which storage backend generated/uploaded images will use. If this
  // says "local disk" in production, Supabase env vars are missing and image
  // URLs will fall back to PUBLIC_API_URL (e.g. localhost) on ephemeral disk.
  if (isSupabaseStorageConfigured()) {
    console.log(`  Image storage: Supabase (bucket=${env.SUPABASE_STORAGE_BUCKET})`)
  } else {
    console.log(`  Image storage: local disk (PUBLIC_API_URL=${env.PUBLIC_API_URL})`)
    // Show which Supabase vars are present so a misconfigured deploy is obvious.
    // Values are never printed — only whether each one is set.
    const seen = (v: string) => (v ? 'set' : 'MISSING')
    console.log(
      `  Supabase vars: SUPABASE_URL=${seen(env.SUPABASE_URL)} ` +
        `SUPABASE_SERVICE_ROLE_KEY=${seen(env.SUPABASE_SERVICE_ROLE_KEY)} ` +
        `SUPABASE_STORAGE_BUCKET=${seen(env.SUPABASE_STORAGE_BUCKET)}`,
    )
  }
  // Drains anything the last process left queued, then retries on a timer.
  startOutbox()
  console.log('  GET  /api/health')
  console.log('  GET  /api/products?page=1&limit=20')
  console.log('  POST /api/extract  { "domain": "biglittlethings.de" }')
})

/**
 * Stop cleanly when the host asks (Cloud Run and Docker send SIGTERM before
 * replacing an instance): no new requests, let the ones in flight finish,
 * stop the outbox timers, close the database pool. Anything still queued is
 * sent by the next instance.
 */
let stopping = false
function shutdown(signal: string): void {
  if (stopping) return
  stopping = true
  console.log(`[process] ${signal} received, shutting down…`)
  stopOutbox()
  // Whatever happens, gone within ten seconds — Cloud Run allows ten.
  setTimeout(() => process.exit(0), 9_000).unref()
  server.close(() => {
    void closeDatabase()
      .catch(() => {})
      .finally(() => process.exit(0))
  })
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
