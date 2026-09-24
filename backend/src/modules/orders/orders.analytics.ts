/**
 * An order's life, as PostHog sees it.
 *
 * The browser records the request being sent (`order requested`); everything
 * after that — a super admin quoting it, confirming it, marking it paid — only
 * ever happens here. Sent under the shopper's own PostHog id, which checkout
 * records on the request, so a funnel can run from the ad click to the money.
 *
 * One event per kind of change, carrying where it moved from:
 *   `order status changed`          new → quoted → confirmed, or cancelled
 *   `order payment status changed`  unpaid → paid
 */

import { captureServerEvent } from '../../services/analytics.js'
import type { OrderDto } from './orders.service.js'

function distinctIdFor(order: OrderDto): string {
  // A request from a browser that blocked PostHog still counts, under an id of
  // its own — it just cannot be joined to the visit that produced it.
  return order.attribution?.posthogDistinctId || `order:${order.id}`
}

function orderProperties(order: OrderDto): Record<string, unknown> {
  return {
    order_id: order.id,
    reference: order.reference,
    status: order.status,
    payment_status: order.paymentStatus,
    source: order.source,
    collection: order.collectionSlug,
    collection_name: order.collectionName,
    total: order.total,
    total_gross: order.totalGross,
    currency: order.currency,
    item_count: order.items.reduce((sum, item) => sum + item.quantity, 0),
    has_box: order.items.some((item) => Boolean(item.box)),
    is_guest: order.isGuest,
    // No person profile for an id nobody will ever look up.
    ...(order.attribution?.posthogDistinctId
      ? {}
      : { $process_person_profile: false }),
  }
}

export function trackStatusChange(
  order: OrderDto,
  previousStatus: OrderDto['status'] | null,
): void {
  if (previousStatus === order.status) return
  captureServerEvent({
    distinctId: distinctIdFor(order),
    event: 'order status changed',
    properties: { ...orderProperties(order), previous_status: previousStatus },
  })
}

export function trackPaymentChange(
  order: OrderDto,
  previousPaymentStatus: OrderDto['paymentStatus'],
): void {
  if (previousPaymentStatus === order.paymentStatus) return
  captureServerEvent({
    distinctId: distinctIdFor(order),
    event: 'order payment status changed',
    properties: {
      ...orderProperties(order),
      previous_payment_status: previousPaymentStatus,
    },
  })
}
