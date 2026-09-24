import { useState } from 'react'
import { Inbox } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useOrders } from '@/hooks/use-orders'
import { useAllCollections } from '@/hooks/use-collections-admin'
import { useAuth } from '@/context/AuthContext'
import {
  ORDER_STATUSES,
  type Order,
  type OrderFilters,
  type OrderStatus,
  type PaymentStatus,
} from '@/api/orders'
import { formatPrice, formatDateTime } from '@/utils/format'

/** Quiet until something needs doing — only `new` earns the eye. */
const STATUS_STYLE: Record<OrderStatus, string> = {
  new: 'border-primary/40 bg-primary/10 text-primary',
  quoted: 'border-border/60 text-muted-foreground',
  confirmed: 'border-border/60 text-muted-foreground',
  cancelled: 'border-border/40 text-muted-foreground line-through',
}

/**
 * Where a request came from, at a glance.
 *
 * Worth its own column now that requests arrive from three different places: a
 * signed-in company, a visitor with no account, and a visitor who came through
 * a paid landing page. The last of those is the one marketing asks about.
 */
function originOf(order: Order): { label: string; className: string } {
  if (order.source === 'funnel') {
    return {
      label: order.collectionName ?? order.collectionSlug ?? 'Campaign',
      className: 'border-primary/40 bg-primary/10 text-primary',
    }
  }
  return {
    label: order.isGuest ? 'Shop · guest' : 'Shop',
    className: 'border-border/60 text-muted-foreground',
  }
}

const PAYMENT_STYLE: Record<PaymentStatus, string> = {
  unpaid: 'border-amber-500/40 bg-amber-500/10 text-amber-700',
  paid: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700',
}

/** `all`, `storefront`, `funnel`, or `c:<collection id>` — one control, not two. */
function originFilter(value: string): Pick<OrderFilters, 'source' | 'collectionId'> {
  if (value === 'storefront' || value === 'funnel') return { source: value }
  if (value.startsWith('c:')) return { collectionId: value.slice(2) }
  return {}
}

function OrderFiltersBar(props: {
  origin: string
  setOrigin: (v: string) => void
  status: string
  setStatus: (v: string) => void
  payment: string
  setPayment: (v: string) => void
}) {
  const { data: collections } = useAllCollections()
  return (
    <div className="flex flex-wrap gap-2">
      <Select value={props.origin} onValueChange={props.setOrigin}>
        <SelectTrigger className="w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All origins</SelectItem>
          <SelectItem value="storefront">Shop</SelectItem>
          <SelectItem value="funnel">Any landing page</SelectItem>
          {collections?.length ? <SelectSeparator /> : null}
          {collections?.map((c) => (
            <SelectItem key={c.id} value={`c:${c.id}`}>
              {c.title.de || c.title.en || c.slug}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={props.status} onValueChange={props.setStatus}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {ORDER_STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="capitalize">
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={props.payment} onValueChange={props.setPayment}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any payment</SelectItem>
          <SelectItem value="unpaid">Unpaid</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Requests waiting to be priced, and orders waiting to be paid.
 *
 * A request becomes an order when a super admin confirms it — that fixes the
 * price and issues the invoice. What the team needs from this page is: who
 * asked, where from, for what, by when, and whether it has been paid.
 */
export function OrdersPage() {
  const { can } = useAuth()
  const admin = can('manage_all')
  const [origin, setOrigin] = useState('all')
  const [status, setStatus] = useState('all')
  const [payment, setPayment] = useState('all')
  const filters: OrderFilters = {
    ...originFilter(origin),
    ...(status !== 'all' ? { status: status as OrderStatus } : {}),
    ...(payment !== 'all' ? { paymentStatus: payment as PaymentStatus } : {}),
  }
  const filtered = Object.keys(filters).length > 0
  const { data: orders, isLoading } = useOrders(filters)
  const navigate = useNavigate()

  const filterBar = admin ? (
    <OrderFiltersBar
      origin={origin}
      setOrigin={setOrigin}
      status={status}
      setStatus={setStatus}
      payment={payment}
      setPayment={setPayment}
    />
  ) : null

  if (isLoading) {
    return (
      <div className="space-y-4">
        {filterBar}
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!orders?.length && filtered) {
    return (
      <div className="space-y-4">
        {filterBar}
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nothing matches these filters.
        </p>
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
      {filterBar}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>From</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Needed by</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Invoice</TableHead>
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
                  {order.billing?.company || order.contact.company || order.contact.email}
                </span>
              </TableCell>
              <TableCell>
                {(() => {
                  const origin = originOf(order)
                  return (
                    <Badge variant="outline" className={origin.className}>
                      {origin.label}
                    </Badge>
                  )
                })()}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {order.delivery?.neededBy || '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {/* Once confirmed, the agreed gross; before, the estimate. */}
                {order.totalGross != null ? (
                  <>
                    {formatPrice(order.totalGross, order.currency)}
                    <span className="block text-xs text-muted-foreground">gross</span>
                  </>
                ) : (
                  <>
                    {formatPrice(order.total, order.currency)}
                    <span className="block text-xs text-muted-foreground">est. net</span>
                  </>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={STATUS_STYLE[order.status]}>
                  {order.status}
                </Badge>
              </TableCell>
              <TableCell>
                {order.invoice ? (
                  <div className="space-y-1">
                    <span className="block font-mono text-xs">{order.invoice.number}</span>
                    {order.paymentStatus && (
                      <Badge
                        variant="outline"
                        className={PAYMENT_STYLE[order.paymentStatus]}
                      >
                        {order.paymentStatus}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {formatDateTime(order.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

    </div>
  )
}
