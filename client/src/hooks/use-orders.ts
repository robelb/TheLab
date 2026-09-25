import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import {
  confirmOrder,
  createOrder,
  fetchOrder,
  fetchOrderEmails,
  fetchOrders,
  resendOrderEmail,
  setOrderStatus,
  setPaymentStatus,
  type ConfirmOrderBody,
  type CreateOrderBody,
  type OrderFilters,
  type OrderStatus,
  type PaymentStatus,
} from '@/api/orders'

export const orderKeys = {
  all: ['orders'] as const,
  list: (filters: OrderFilters = {}) => ['orders', 'list', filters] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  emails: (id: string) => ['orders', 'emails', id] as const,
}

/**
 * The requests this company has sent, newest first.
 *
 * Gated on being signed in: the endpoint answers 401 to anyone else, and the
 * storefront is now browsable without an account, so an ungated read would fire
 * a guaranteed failure on every visit.
 */
export function useOrders(filters: OrderFilters = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: () => fetchOrders(filters),
    enabled: Boolean(user),
  })
}

export function useOrder(id: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => fetchOrder(id),
    enabled: Boolean(id) && Boolean(user),
  })
}

export function useCreateOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateOrderBody) => createOrder(body),
    onSuccess: () => client.invalidateQueries({ queryKey: orderKeys.all }),
  })
}

export function useSetOrderStatus() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; status: OrderStatus }) =>
      setOrderStatus(vars.id, vars.status),
    onSuccess: () => client.invalidateQueries({ queryKey: orderKeys.all }),
  })
}

export function useSetPaymentStatus() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; paymentStatus: PaymentStatus }) =>
      setPaymentStatus(vars.id, vars.paymentStatus),
    onSuccess: () => client.invalidateQueries({ queryKey: orderKeys.all }),
  })
}

export function useConfirmOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; body: ConfirmOrderBody }) =>
      confirmOrder(vars.id, vars.body),
    onSuccess: () => client.invalidateQueries({ queryKey: orderKeys.all }),
  })
}

export function useResendOrderEmail() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; template: 'received' | 'confirmed' }) =>
      resendOrderEmail(vars.id, vars.template),
    // Sent or not, the log has a new row.
    onSettled: (_data, _err, vars) =>
      client.invalidateQueries({ queryKey: orderKeys.emails(vars.id) }),
  })
}

/**
 * The emails queued for an order and whether each went out. Polls while one is
 * still waiting for a retry, so a send that recovers shows up without a reload.
 */
export function useOrderEmails(id: string, enabled = true) {
  return useQuery({
    queryKey: orderKeys.emails(id),
    queryFn: () => fetchOrderEmails(id),
    enabled: Boolean(id) && enabled,
    refetchInterval: (query) =>
      query.state.data?.some((e) => e.status === 'pending' || e.status === 'sending')
        ? 15_000
        : false,
  })
}
