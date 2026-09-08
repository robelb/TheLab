import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

/** The requests this company has sent, newest first. */
export function useOrders() {
  return useQuery({ queryKey: orderKeys.list(), queryFn: fetchOrders })
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => fetchOrder(id),
    enabled: Boolean(id),
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
