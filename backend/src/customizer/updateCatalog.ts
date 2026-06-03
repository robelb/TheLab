import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { brandCustomizations } from '../db/schema/index.js'

export function customizedImagePublicUrl(
  productId: string,
  baseUrl = process.env.PUBLIC_API_URL?.trim() || 'http://localhost:3001',
  version?: number | string,
): string {
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const imagePath = `${normalizedBase}/api/customized/${productId}.png`
  if (version === undefined) return imagePath
  return `${imagePath}?v=${version}`
}

export async function upsertBrandCustomizations(
  domain: string,
  generation: string,
  updates: Array<{ productId: string; imageUrl: string }>,
): Promise<void> {
  await Promise.all(
    updates.map(async ({ productId, imageUrl }) => {
      const existing = await db
        .select({ id: brandCustomizations.id })
        .from(brandCustomizations)
        .where(
          and(
            eq(brandCustomizations.domain, domain),
            eq(brandCustomizations.productId, productId),
          ),
        )
        .limit(1)

      if (existing.length > 0) {
        await db
          .update(brandCustomizations)
          .set({ imageUrl, generation })
          .where(eq(brandCustomizations.id, existing[0].id))
      } else {
        await db.insert(brandCustomizations).values({
          domain,
          productId,
          imageUrl,
          generation,
        })
      }
    }),
  )
}

export async function getCustomizationsForDomain(
  domain: string,
): Promise<Record<string, string>> {
  const rows = await db
    .select({
      productId: brandCustomizations.productId,
      imageUrl: brandCustomizations.imageUrl,
    })
    .from(brandCustomizations)
    .where(eq(brandCustomizations.domain, domain))

  return Object.fromEntries(rows.map((r) => [r.productId, r.imageUrl]))
}
