import { apiClient } from '@/lib/api-client'
import type { ProductDesign } from '@/lib/boxDraft'
import type { BoxDetails } from '@/types/box'

export const ORDER_STATUSES = ['new', 'quoted', 'confirmed', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export interface OrderContact {
  name: string
  email: string
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
