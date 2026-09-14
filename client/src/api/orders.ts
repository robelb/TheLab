import { apiClient } from '@/lib/api-client'
import type { ProductDesign } from '@/lib/boxDraft'
import type { BoxDetails } from '@/types/box'

export const ORDER_STATUSES = ['new', 'quoted', 'confirmed', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export interface OrderContact {
  name: string
  email: string
  /** Guests have no company record behind them, so they type the name. */
  company?: string | null
  phone?: string | null
}

/** Where the visit came from, captured first-touch by the browser. */
export interface OrderAttribution {
  gclid?: string | null
  fbclid?: string | null
  msclkid?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  utmContent?: string | null
  landingPath?: string | null
  referrer?: string | null
  firstSeenAt?: string | null
  posthogDistinctId?: string | null
  guestSessionId?: string | null
}

export interface OrderDelivery {
  address?: string | null
  city?: string | null
  zip?: string | null
  country?: string | null
  /** When they need it in hand. */
  neededBy?: string | null
  notes?: string | null
}

/** One cart line as it was sent. A box carries everything built into it. */
export interface OrderItem {
  productId: string
  name: string
  sku?: string | null
  image?: string | null
  unitPrice: number
  quantity: number
  currency?: string | null
  box?: BoxDetails | null
  /** Set when this single product was branded in the editor. */
  design?: ProductDesign | null
  /** Set by the server: whether a box kept its ready-made price or was summed. */
  pricingMode?: 'bundle' | 'parts'
}

export interface Order {
  id: string
  /** Short and sayable — what a quote is written against. */
  reference: string
  status: OrderStatus
  createdAt: string
  updatedAt: string
  contact: OrderContact
  delivery: OrderDelivery | null
  items: OrderItem[]
  subtotal: number
  shipping: number
  total: number
  currency: string
  /** Null when the request came in with no account behind it. */
  companyId?: string | null
  isGuest?: boolean
  source?: 'storefront' | 'funnel'
  locale?: string
  collectionSlug?: string | null
  attribution?: OrderAttribution | null
}

/**
 * No totals here on purpose.
 *
 * The server prices the request from the line prices it is given. Sending a
 * total would only invite it to be believed.
 */
export interface CreateOrderBody {
  contact: OrderContact
  delivery?: OrderDelivery | null
  items: OrderItem[]
  currency?: string
  /** Language the request was written in, so the reply matches it. */
  locale?: 'de' | 'en'
  /** `funnel` when they came in through a landing page. */
  source?: 'storefront' | 'funnel'
  collectionSlug?: string | null
  attribution?: OrderAttribution | null
}

export async function createOrder(body: CreateOrderBody): Promise<Order> {
  const { data } = await apiClient.post<Order>('/orders', body)
  return data
}

export async function fetchOrders(): Promise<Order[]> {
  const { data } = await apiClient.get<Order[]>('/orders')
  return data
}

export async function fetchOrder(id: string): Promise<Order> {
  const { data } = await apiClient.get<Order>(`/orders/${id}`)
  return data
}

export async function setOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<Order> {
  const { data } = await apiClient.patch<Order>(`/orders/${id}`, { status })
  return data
}
