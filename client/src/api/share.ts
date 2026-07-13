import { apiClient } from '@/lib/api-client'

/** Brand snapshot persisted with a share so the viewer renders our branding. */
export interface ShareBrand {
  companyName?: string | null
  logo?: string | null
  logoType?: string | null
  primaryColor?: string | null
}

export interface CreateShareRequest {
  imageUrl: string
  productId?: string
  domain?: string
  title?: string
  prompt?: string
  brand?: ShareBrand
}

export interface ShareView {
  slug: string
  imageUrl: string
  title: string | null
  prompt: string | null
  status: 'pending' | 'saved' | string
  brand: ShareBrand | null
  createdAt: string
  product: {
    id: string
    name: string
    price: number
    currency: string
    tagline: string | null
  } | null
}

/** Mint a public share link for an image. Returns the slug (not the URL). */
export async function createShare(
  body: CreateShareRequest,
): Promise<{ slug: string }> {
  const { data } = await apiClient.post<{ slug: string }>('/share', body)
  return data
}

export async function getShare(slug: string): Promise<ShareView> {
  const { data } = await apiClient.get<ShareView>(
    `/share/${encodeURIComponent(slug)}`,
  )
  return data
}

/** A generated design as listed in the dashboard. */
export interface ShareSummary {
  slug: string
  imageUrl: string
  prompt: string | null
  status: 'pending' | 'saved' | string
  createdAt: string
}

/** All generated designs for a product (dashboard-only), newest first. */
export async function listProductShares(
  productId: string,
): Promise<ShareSummary[]> {
  const { data } = await apiClient.get<{ data: ShareSummary[] }>(
    `/share/product/${encodeURIComponent(productId)}`,
  )
  return data.data
}

/** Promote a pending share to saved (attaches its image to the product). */
export async function saveShare(slug: string): Promise<ShareView> {
  const { data } = await apiClient.post<ShareView>(
    `/share/${encodeURIComponent(slug)}/save`,
  )
  return data
}

/** Delete a generated design record (leaves any already-saved gallery image). */
export async function deleteShare(slug: string): Promise<void> {
  await apiClient.delete(`/share/${encodeURIComponent(slug)}`)
}

/** Absolute link to the branded viewer for a slug. */
export function shareUrl(slug: string): string {
  return `${window.location.origin}/share/${slug}`
}
