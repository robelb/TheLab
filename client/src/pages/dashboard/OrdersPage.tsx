import { Inbox } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useOrders } from '@/hooks/use-orders'
import type { OrderStatus } from '@/api/orders'
import { formatPrice } from '@/utils/format'

/** Quiet until something needs doing — only `new` earns the eye. */
const STATUS_STYLE: Record<OrderStatus, string> = {
  new: 'border-primary/40 bg-primary/10 text-primary',
  quoted: 'border-border/60 text-muted-foreground',
  confirmed: 'border-border/60 text-muted-foreground',
  cancelled: 'border-border/40 text-muted-foreground line-through',
}

function stamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })} · ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * Requests waiting to be priced.
 *
 * The work item is a conversation, not a transaction — nothing here charges
 * anyone. What the team needs from this page is: who asked, for what, by when,
 * and what was approved to print.
 */
export function OrdersPage() {
  const { data: orders, isLoading } = useOrders()
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (!orders?.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <Inbox className="size-8 text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">No requests yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          When someone sends a box request from the shop, it lands here with
          everything needed to price and print it.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>From</TableHead>
            <TableHead>Needed by</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Sent</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow
              key={order.id}
              className="cursor-pointer"
              onClick={() => navigate(`/dashboard/orders/${order.id}`)}
            >
              <TableCell className="font-mono text-xs">{order.reference}</TableCell>
              <TableCell>
                <span className="block text-sm">{order.contact.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {order.contact.email}
                </span>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {order.delivery?.neededBy || '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPrice(order.total, order.currency)}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={STATUS_STYLE[order.status]}>
                  {order.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {stamp(order.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

    </div>
  )
}
