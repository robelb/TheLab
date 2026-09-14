import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import {
  createOrder,
  fetchOrder,
  fetchOrders,
  setOrderStatus,
  type CreateOrderBody,
  type OrderStatus,
} from '@/api/orders'

export const orderKeys = {
  all: ['orders'] as const,
  list: () => ['orders', 'list'] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
}

/**
 * The requests this company has sent, newest first.
 *
 * Gated on being signed in: the endpoint answers 401 to anyone else, and the
 * storefront is now browsable without an account, so an ungated read would fire
 * a guaranteed failure on every visit.
 */
export function useOrders() {
  const { user } = useAuth()
  return useQuery({
    queryKey: orderKeys.list(),
    queryFn: fetchOrders,
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
