import { apiClient } from '@/lib/api-client'
import type { BrandConfig } from '@/config/brand.types'
import type { ExtractionPayload } from '@/lib/mapExtractionToBrand'

/** A theme and a version that changes exactly when the theme does. */
export interface VersionedTheme<T> {
  version: string
  brand: T
}

export interface ThemeBundle {
  /** The big little things theme; null means "the one the app ships with". */
  house: VersionedTheme<BrandConfig> | null
  /** The signed-in visitor's company theme. */
  company: (VersionedTheme<ExtractionPayload> & { id: string }) | null
}

export async function fetchTheme(): Promise<ThemeBundle> {
  const { data } = await apiClient.get<ThemeBundle>('/theme')
  return data
}

export async function saveHouseTheme(
  brand: BrandConfig,
): Promise<VersionedTheme<BrandConfig>> {
  const { data } = await apiClient.put<VersionedTheme<BrandConfig>>(
    '/theme/house',
    { brand },
  )
  return data
}

export async function resetHouseTheme(): Promise<void> {
  await apiClient.delete('/theme/house')
}
