import { apiClient } from '@/lib/api-client'
import type { ProductDesign } from '@/lib/boxDraft'
import type { BoxDetails } from '@/types/box'

export const ORDER_STATUSES = ['new', 'quoted', 'confirmed', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_STATUSES = ['unpaid', 'paid'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export interface OrderContact {
  /** First and last name joined. */
  name: string
  firstName?: string | null
  lastName?: string | null
  email: string
  /** Guests have no company record behind them, so they type the name. */
  company?: string | null
  phone?: string | null
  position?: string | null
}

/** Who the invoice is made out to. */
export interface OrderBilling {
  company: string
  name?: string | null
  street: string
  line2?: string | null
  zip: string
  city: string
  /** ISO 3166-1 alpha-2 — only `DE` for now. */
  country: string
  vatId?: string | null
  poNumber?: string | null
  email?: string | null
}

export interface InvoiceSummary {
  id: string
  number: string
  issuedAt: string
  dueAt: string
  gross: number
  currency: string
}

/** Where the visit came from, captured at the last ad click by the browser. */
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
  /** The first collection this browser landed on, when it differs. */
  entrySlug?: string | null
}

export interface OrderDelivery {
  /** Ships to the billing address; the fields below then copy it. */
  sameAsBilling?: boolean | null
  address?: string | null
  line2?: string | null
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
  collectionId?: string | null
  /** The collection's title when the request came in. */
  collectionName?: string | null
  attribution?: OrderAttribution | null
  billing?: OrderBilling | null
  paymentMethod?: 'invoice' | null
  paymentStatus?: PaymentStatus | null
  privacyAcceptedAt?: string | null
  /** Set once a super admin has agreed the final price. */
  confirmedAt?: string | null
  vatRate?: number | null
  vat?: number | null
  totalGross?: number | null
  invoice?: InvoiceSummary | null
}

/**
 * No totals here on purpose.
 *
 * The server prices the request from the line prices it is given. Sending a
 * total would only invite it to be believed.
 */
export interface CreateOrderBody {
  contact: OrderContact
  billing?: OrderBilling | null
  delivery?: OrderDelivery | null
  items: OrderItem[]
  currency?: string
  /** Language the request was written in, so the reply matches it. */
  locale?: 'de' | 'en'
  /** The collection they are buying in. The server decides the source from it. */
  collectionSlug?: string | null
  attribution?: OrderAttribution | null
  paymentMethod?: 'invoice'
  privacyAccepted?: boolean
}

export interface OrderFilters {
  source?: 'storefront' | 'funnel'
  collectionId?: string
  status?: OrderStatus
  paymentStatus?: PaymentStatus
}

/** The final price a super admin agrees, line by line. */
export interface ConfirmOrderBody {
  lines: { index: number; unitPrice: number }[]
  shipping: number
  /** When the invoice is due, `YYYY-MM-DD`; the server's usual term if left out. */
  dueDate?: string
  /** Who to invoice, when the request came without a billing address. */
  billing?: OrderBilling
}

export async function createOrder(body: CreateOrderBody): Promise<Order> {
  const { data } = await apiClient.post<Order>('/orders', body)
  return data
}

export async function fetchOrders(filters: OrderFilters = {}): Promise<Order[]> {
  const { data } = await apiClient.get<Order[]>('/orders', { params: filters })
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

export async function setPaymentStatus(
  id: string,
  paymentStatus: PaymentStatus,
): Promise<Order> {
  const { data } = await apiClient.patch<Order>(`/orders/${id}`, { paymentStatus })
  return data
}

/**
 * What became of an email the server was asked to send now. `queued` means the
 * server has no mail provider configured, so it waits in the queue.
 */
export type EmailDelivery =
  | { status: 'sent' }
  | { status: 'failed'; error: string; willRetry: boolean }
  | { status: 'queued' }

export async function confirmOrder(
  id: string,
  body: ConfirmOrderBody,
): Promise<Order & { emailDelivery?: EmailDelivery }> {
  const { data } = await apiClient.post<Order & { emailDelivery?: EmailDelivery }>(
    `/orders/${id}/confirm`,
    body,
  )
  return data
}

/** Sends it now. A failed send rejects, with the reason as the error message. */
export async function resendOrderEmail(
  id: string,
  template: 'received' | 'confirmed',
): Promise<EmailDelivery> {
  const { data } = await apiClient.post<EmailDelivery>(`/orders/${id}/resend-email`, {
    template,
  })
  return data
}

export interface OrderEmail {
  id: string
  kind: 'email.order_received' | 'email.order_notify' | 'email.order_confirmed'
  status: 'pending' | 'sending' | 'sent' | 'failed'
  attempts: number
  lastError: string | null
  createdAt: string
  sentAt: string | null
  nextAttemptAt: string | null
}

export async function fetchOrderEmails(id: string): Promise<OrderEmail[]> {
  const { data } = await apiClient.get<OrderEmail[]>(`/orders/${id}/emails`)
  return data
}

/** The invoice PDF, fetched with the session so it can be opened as a blob. */
export async function fetchInvoicePdf(id: string): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/orders/${id}/invoice.pdf`, {
    responseType: 'blob',
  })
  return data
}
