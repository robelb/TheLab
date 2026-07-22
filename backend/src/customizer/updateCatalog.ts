import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { brandCustomizations } from '../db/schema/index.js'
import { apiPublicImageUrl } from '../lib/publicImageUrl.js'

export function customizedImagePublicUrl(
  productId: string,
  baseUrl?: string,
  version?: number | string,
): string {
  const imagePath = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/api/customized/${productId}.png`
    : apiPublicImageUrl(`/api/customized/${productId}.png`)
  if (version === undefined) return imagePath
  return `${imagePath}?v=${version}`
}

export async function upsertBrandCustomizations(
  companyId: string,
  domain: string | null,
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
            eq(brandCustomizations.companyId, companyId),
            eq(brandCustomizations.productId, productId),
          ),
        )
        .limit(1)

      if (existing.length > 0) {
        await db
          .update(brandCustomizations)
          .set({ imageUrl, generation, domain })
          .where(eq(brandCustomizations.id, existing[0].id))
      } else {
        await db.insert(brandCustomizations).values({
          companyId,
          domain,
          productId,
          imageUrl,
          generation,
        })
      }
    }),
  )
}

export async function getCustomizationsForCompany(
  companyId: string,
): Promise<Record<string, string>> {
  const rows = await db
    .select({
      productId: brandCustomizations.productId,
      imageUrl: brandCustomizations.imageUrl,
    })
    .from(brandCustomizations)
    .where(eq(brandCustomizations.companyId, companyId))

  return Object.fromEntries(rows.map((r) => [r.productId, r.imageUrl]))
}
