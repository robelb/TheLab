import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  systemInstructions,
  type SystemInstruction,
} from '../../db/schema/index.js'
import {
  INSTRUCTION_DEFINITIONS,
  getInstructionDefinition,
  type InstructionDefinition,
} from '../../systemInstruction/registry.js'

// ─────────────────────────────────────────────────────────────────────────────
// Override resolution (hot path — called per AI generation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Short TTL cache so image renders don't pay a DB round-trip per prompt.
 * Writes through this module bust the entry immediately, so edits from the
 * admin dashboard apply on the next generation.
 */
const CACHE_TTL_MS = 15_000

interface CacheEntry {
  /** Active override template, or null when none applies. */
  template: string | null
  at: number
}

const cache = new Map<string, CacheEntry>()

function bustCache(key: string): void {
  cache.delete(key)
}

/** Substitute `{{placeholder}}` tokens; unknown tokens render as ''. */
export function renderInstructionTemplate(
  template: string,
  vars: Record<string, string> = {},
): string {
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) => vars[name] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The rendered admin override for `key`, or null when the built-in prompt
 * should be used (no row, row inactive, or any failure). NEVER throws — a
 * broken override system must not break image generation.
 */
export async function resolveInstruction(
  key: string,
  vars: Record<string, string> = {},
): Promise<string | null> {
  try {
    const hit = cache.get(key)
    let template: string | null
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      template = hit.template
    } else {
      const [row] = await db
        .select()
        .from(systemInstructions)
        .where(eq(systemInstructions.key, key))
        .limit(1)
      template = row?.isActive && row.content.trim() ? row.content : null
      cache.set(key, { template, at: Date.now() })
    }
    if (!template) return null
    const rendered = renderInstructionTemplate(template, vars)
    return rendered || null
  } catch (err) {
    console.warn(
      `[system-instructions] override lookup failed for "${key}", using built-in prompt:`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin CRUD
// ─────────────────────────────────────────────────────────────────────────────

export interface InstructionView extends InstructionDefinition {
  override: {
    content: string
    isActive: boolean
    updatedAt: string
    createdAt: string
  } | null
}

function toOverrideView(row: SystemInstruction | undefined) {
  if (!row) return null
  return {
    content: row.content,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

/** Every known instruction, with its override row (if any) attached. */
export async function listInstructions(): Promise<InstructionView[]> {
  const rows = await db.select().from(systemInstructions)
  const byKey = new Map(rows.map((r) => [r.key, r]))
  return INSTRUCTION_DEFINITIONS.map((def) => ({
    ...def,
    override: toOverrideView(byKey.get(def.key)),
  }))
}

export interface UpsertInstructionInput {
  content: string
  isActive?: boolean
}

/** Create or update the override for a known key. Returns null for unknown keys. */
export async function upsertInstruction(
  key: string,
  input: UpsertInstructionInput,
  updatedBy?: string,
): Promise<InstructionView | null> {
  const def = getInstructionDefinition(key)
  if (!def) return null

  const values = {
    key,
    content: input.content,
    isActive: input.isActive ?? true,
    updatedBy: updatedBy ?? null,
  }
  const [row] = await db
    .insert(systemInstructions)
    .values(values)
    .onConflictDoUpdate({
      target: systemInstructions.key,
      set: {
        content: values.content,
        isActive: values.isActive,
        updatedBy: values.updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning()

  bustCache(key)
  return { ...def, override: toOverrideView(row) }
}

/** Remove the override → the built-in prompt applies again. */
export async function deleteInstruction(key: string): Promise<boolean> {
  const def = getInstructionDefinition(key)
  if (!def) return false
  await db.delete(systemInstructions).where(eq(systemInstructions.key, key))
  bustCache(key)
  return true
}
