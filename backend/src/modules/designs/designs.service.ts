/**
 * Saved design versions — the editor's history, kept server-side.
 *
 * Every query is scoped by company as well as by id, so a version can only ever
 * be read, renamed or deleted by the company that made it. That is also why the
 * single-row operations take a `companyId` rather than trusting the id alone.
 */

import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { designVersions } from '../../db/schema/index.js'
import type { PlacementLayout } from '../../customizer/placementLayout.js'
import type { CreateDesignVersionBody } from './designs.schema.js'

/** What the client works with — the set, flattened out of the row. */
export interface DesignVersionDto {
  id: string
  label: string
  createdAt: string
  updatedAt: string
  source: string
  flat: string | null
  photoreal: string | null
  prompt: string | null
  layout: PlacementLayout | null
  logoUrl: string | null
}

type Row = typeof designVersions.$inferSelect

function toDto(row: Row): DesignVersionDto {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    source: row.sourceImageUrl,
    flat: row.flatImageUrl,
    photoreal: row.photorealImageUrl,
    prompt: row.prompt,
    layout: row.layout ?? null,
    logoUrl: row.logoUrl,
  }
}

/** Newest first — the list reads as a history and the top one is the latest. */
export async function listDesignVersions(params: {
  companyId: string
  productId: string
}): Promise<DesignVersionDto[]> {
  const rows = await db
    .select()
    .from(designVersions)
    .where(
      and(
        eq(designVersions.companyId, params.companyId),
        eq(designVersions.productId, params.productId),
      ),
    )
    .orderBy(desc(designVersions.createdAt))
  return rows.map(toDto)
}

export async function createDesignVersion(params: {
  companyId: string
  productId: string
  body: CreateDesignVersionBody
}): Promise<DesignVersionDto> {
  const { body } = params
  // Fall back to a position rather than rejecting an unnamed save: naming is
  // the point of user-triggered versions, but an empty box should not lose work.
  const label = body.label?.trim() || (await nextLabel(params))

  const [row] = await db
    .insert(designVersions)
    .values({
      companyId: params.companyId,
      productId: params.productId,
      label,
      sourceImageUrl: body.source,
      flatImageUrl: body.flat ?? null,
      photorealImageUrl: body.photoreal ?? null,
      prompt: body.prompt ?? null,
      layout: body.layout ?? null,
      logoUrl: body.logoUrl ?? null,
    })
    .returning()

  return toDto(row)
}

async function nextLabel(params: {
  companyId: string
  productId: string
}): Promise<string> {
  const existing = await listDesignVersions(params)
  return `Version ${existing.length + 1}`
}

export async function renameDesignVersion(params: {
  companyId: string
  versionId: string
  label: string
}): Promise<DesignVersionDto | null> {
  const [row] = await db
    .update(designVersions)
    .set({ label: params.label, updatedAt: new Date() })
    .where(
      and(
        eq(designVersions.id, params.versionId),
        eq(designVersions.companyId, params.companyId),
      ),
    )
    .returning()
  return row ? toDto(row) : null
}

export async function deleteDesignVersion(params: {
  companyId: string
  versionId: string
}): Promise<boolean> {
  const rows = await db
    .delete(designVersions)
    .where(
      and(
        eq(designVersions.id, params.versionId),
        eq(designVersions.companyId, params.companyId),
      ),
    )
    .returning({ id: designVersions.id })
  return rows.length > 0
}
