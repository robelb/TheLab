import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

let resolved = false
let client: SupabaseClient | null = null
let bucketEnsured: Promise<void> | null = null

/**
 * Lazily create the Supabase client from env. Returns null when Storage isn't
 * configured, so callers can fall back to local disk.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_STORAGE_BUCKET.
 * The service-role key is used server-side only and bypasses RLS.
 */
function getClient(): SupabaseClient | null {
  if (resolved) return client
  resolved = true

  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.SUPABASE_STORAGE_BUCKET
  ) {
    return null
  }

  try {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    return client
  } catch (err) {
    console.warn(
      '[supabase] initialisation failed, falling back to local storage:',
      err instanceof Error ? err.message : err,
    )
    client = null
    return null
  }
}

export function isSupabaseStorageConfigured(): boolean {
  return getClient() !== null
}

/** Create the bucket (public) once if it doesn't already exist. */
async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  if (!bucketEnsured) {
    bucketEnsured = (async () => {
      const bucket = env.SUPABASE_STORAGE_BUCKET
      const { data, error } = await supabase.storage.getBucket(bucket)
      if (data) return
      // Not found (or list failed) → try to create it as a public bucket.
      const { error: createError } = await supabase.storage.createBucket(
        bucket,
        { public: true },
      )
      // Ignore "already exists" races; surface anything else.
      if (createError && !/exist/i.test(createError.message)) {
        throw new Error(
          `Could not ensure Supabase bucket "${bucket}": ${createError.message}`,
        )
      }
      if (error && !data && createError) {
        // Both calls failed for an unexpected reason.
        throw new Error(error.message)
      }
    })().catch((err) => {
      // Reset so a later upload can retry, then rethrow.
      bucketEnsured = null
      throw err
    })
  }
  return bucketEnsured
}

export interface UploadOptions {
  contentType: string
  /** File extension used for the random filename (when `path` is not given). */
  ext?: string
  /** Folder within the bucket for the random filename. */
  prefix?: string
  /** Explicit object path; overrides `prefix`/`ext` random naming. */
  path?: string
  /** Overwrite an existing object at the same path. */
  upsert?: boolean
}

/**
 * Upload a buffer to Supabase Storage and return its permanent public URL.
 * The bucket is public, so the URL is stable and CDN-served.
 */
export async function uploadToSupabase(
  buffer: Buffer,
  { contentType, ext = 'webp', prefix = 'uploads', path, upsert = false }: UploadOptions,
): Promise<string> {
  const supabase = getClient()
  if (!supabase) throw new Error('Supabase Storage is not configured.')

  await ensureBucket(supabase)

  const bucket = env.SUPABASE_STORAGE_BUCKET
  const objectPath = path ?? `${prefix}/${randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(bucket)
    .upload(objectPath, buffer, {
      contentType,
      cacheControl: '31536000',
      upsert,
    })

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`)
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath)
  return data.publicUrl
}
