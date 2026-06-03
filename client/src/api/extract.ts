import { apiClient } from '@/lib/api-client'
import type { ExtractionPayload } from '@/lib/mapExtractionToBrand'

export async function extractBrand(domain: string): Promise<ExtractionPayload> {
  const { data } = await apiClient.post<ExtractionPayload>('/extract', {
    domain,
  })
  return data
}
