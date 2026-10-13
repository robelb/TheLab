import { useMemo } from 'react'
import { CircleAlert, Inbox, Loader2, RotateCw, Search, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import type { Order, OrderStatus, PaymentStatus } from '@/api/orders'
import {
  matchesSearch,
  orderSize,
  orderTodos,
  shippingLabel,
  type OrderTodo,
} from '@/lib/orderOps'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime, formatPrice } from '@/utils/format'

/** Quiet until something needs doing — only `new` earns the eye. */
const STATUS_STYLE: Record<OrderStatus, string> = {
  new: 'border-primary/40 bg-primary/10 text-primary',
  quoted: 'border-border/60 text-muted-foreground',
  confirmed: 'border-border/60 text-muted-foreground',
  cancelled: 'border-border/40 text-muted-foreground line-through',
}

const PAYMENT_STYLE: Record<PaymentStatus, string> = {
  unpaid: 'border-amber-500/40 bg-amber-500/10 text-amber-700',
  paid: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700',
}

/**
 * The views the team works from, one click each. "Needs action" is the inbox:
 * every request with something left to do — see `orderTodos`. Each label is
 * `dashboard.orders.tabs.<key>`.
 */
const TABS = [
  { key: 'action', test: (_o: Order, todos: OrderTodo[]) => todos.length > 0 },
  { key: 'new', test: (o: Order) => o.status === 'new' },
  { key: 'quoted', test: (o: Order) => o.status === 'quoted' },
  { key: 'unpaid', test: (o: Order) => Boolean(o.invoice) && o.paymentStatus !== 'paid' },
  { key: 'paid', test: (o: Order) => o.paymentStatus === 'paid' },
  { key: 'cancelled', test: (o: Order) => o.status === 'cancelled' },
  { key: 'all', test: () => true },
] as const

type TabKey = (typeof TABS)[number]['key']

function originLabel(order: Order, t: TFunction): string {
  if (order.source === 'funnel') {
    return order.collectionName ?? order.collectionSlug ?? t('dashboard.orders.list.originCollection')
  }
  return order.isGuest ? t('dashboard.orders.list.originShopGuest') : t('dashboard.orders.list.originShop')
}

/** `all`, `storefront`, `funnel`, or `c:<collection id>` — one control, not two. */
function matchesOrigin(order: Order, origin: string): boolean {
  if (origin === 'all') return true
  if (origin === 'storefront' || origin === 'funnel') return order.source === origin
  if (origin.startsWith('c:')) return order.collectionId === origin.slice(2)
  return true
}

/**
 * Requests and orders, as the operations team works through them.
 *
 * Everything filters in the browser over the full list — it is short, so
 * every change is instant — and lives in the URL, so a view can be
 * bookmarked or sent to a colleague as it is.
 */
export function OrdersPage() {
  const { t, i18n } = useTranslation()
  const { can } = useAuth()
  const admin = can('manage_all')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data: orders, isLoading, error, refetch, isFetching } = useOrders({})
  const { data: collections } = useAllCollections()

  // "Needs action" and the to-do chips are the operations team's work list;
  // a company sees its requests without them, starting on all of them.
  const tabs = admin ? TABS : TABS.filter((view) => view.key !== 'action')
  const defaultTab: TabKey = admin ? 'action' : 'all'
  const tab = (tabs.some((t) => t.key === params.get('tab')) ? params.get('tab') : defaultTab) as TabKey
  const q = params.get('q') ?? ''
  const origin = params.get('origin') ?? 'all'
  const shipping = params.get('ship') ?? 'all'
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const sort = params.get('sort') === 'due' ? 'due' : 'newest'

  const set = (key: string, value: string, empty = '') =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (!value || value === empty) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  // The chips are worded in the current language, so they follow a switch.
  const language = i18n.language
  const withTodos = useMemo(
    () => (orders ?? []).map((order) => ({ order, todos: orderTodos(order) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, language],
  )

  // The filters other than the tab, so each tab can show how many it holds.
  const narrowed = withTodos.filter(({ order }) => {
    if (!matchesSearch(order, q)) return false
    if (!matchesOrigin(order, origin)) return false
    if (shipping !== 'all' && (order.shippingMethod ?? 'bulk') !== shipping) return false
    const due = order.delivery?.neededBy ?? ''
    if (from && (!due || due < from)) return false
    if (to && (!due || due > to)) return false
    return true
  })
  const counts = Object.fromEntries(
    TABS.map((t) => [t.key, narrowed.filter(({ order, todos }) => t.test(order, todos)).length]),
  ) as Record<TabKey, number>
  const active = TABS.find((t) => t.key === tab)!
  const rows = narrowed
    .filter(({ order, todos }) => active.test(order, todos))
    .sort((a, b) => {
      if (sort === 'due') {
        const da = a.order.delivery?.neededBy || '9999'
        const db = b.order.delivery?.neededBy || '9999'
        if (da !== db) return da < db ? -1 : 1
      }
      return b.order.createdAt.localeCompare(a.order.createdAt)
    })

  const filtering = Boolean(q || origin !== 'all' || shipping !== 'all' || from || to)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  // A failed load is not an empty inbox: say so, and offer to try again.
  if (error && !orders) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <CircleAlert className="size-8 text-destructive" />
        <h2 className="font-display text-xl font-semibold">
          {t('dashboard.orders.list.loadFailedTitle')}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t('dashboard.orders.list.loadFailedBody')}
        </p>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
          {t('dashboard.orders.list.retry')}
        </Button>
      </div>
    )
  }

  if (!orders?.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <Inbox className="size-8 text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">
          {t('dashboard.orders.list.emptyTitle')}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t('dashboard.orders.list.emptyBody')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Views ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 border-b border-border/40" role="tablist">
        {tabs.map((view) => (
          <button
            key={view.key}
            type="button"
            role="tab"
            aria-selected={view.key === tab}
            onClick={() => set('tab', view.key, defaultTab)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
              view.key === tab
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`dashboard.orders.tabs.${view.key}`)}
            <span
              className={cn(
                'rounded-full px-1.5 text-xs tabular-nums',
                view.key === 'action' && counts.action > 0
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-foreground/70',
              )}
            >
              {counts[view.key]}
            </span>
          </button>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            placeholder={t('dashboard.orders.list.searchPlaceholder')}
            aria-label={t('dashboard.orders.list.searchLabel')}
            className="h-9 pl-9"
          />
        </div>
        {admin && (
          <Select value={origin} onValueChange={(v) => set('origin', v, 'all')}>
            <SelectTrigger className="h-9 w-[190px]" aria-label={t('dashboard.orders.list.origin')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dashboard.orders.list.allOrigins')}</SelectItem>
              <SelectItem value="storefront">{t('dashboard.orders.list.originShop')}</SelectItem>
              <SelectItem value="funnel">{t('dashboard.orders.list.anyCollection')}</SelectItem>
              {collections?.length ? <SelectSeparator /> : null}
              {collections?.map((c) => (
                <SelectItem key={c.id} value={`c:${c.id}`}>
                  {c.title.de || c.title.en || c.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={shipping} onValueChange={(v) => set('ship', v, 'all')}>
          <SelectTrigger className="h-9 w-[150px]" aria-label={t('dashboard.orders.list.shipping')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('dashboard.orders.list.anyShipping')}</SelectItem>
            <SelectItem value="bulk">{shippingLabel('bulk')}</SelectItem>
            <SelectItem value="individual">{shippingLabel('individual')}</SelectItem>
            <SelectItem value="mixed">{shippingLabel('mixed')}</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t('dashboard.orders.list.neededBy')}
          <Input
            type="date"
            value={from}
            onChange={(e) => set('from', e.target.value)}
            className="h-9 w-[140px]"
            aria-label={t('dashboard.orders.list.dateFrom')}
          />
          –
          <Input
            type="date"
            value={to}
            onChange={(e) => set('to', e.target.value)}
            className="h-9 w-[140px]"
            aria-label={t('dashboard.orders.list.dateTo')}
          />
        </label>
        <Select value={sort} onValueChange={(v) => set('sort', v, 'newest')}>
          <SelectTrigger className="h-9 w-[170px]" aria-label={t('dashboard.orders.list.sort')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t('dashboard.orders.list.sortNewest')}</SelectItem>
            <SelectItem value="due">{t('dashboard.orders.list.sortDue')}</SelectItem>
          </SelectContent>
        </Select>
        {filtering && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setParams(tab === defaultTab ? {} : { tab }, { replace: true })
            }
          >
            <X className="size-4" />
            {t('dashboard.orders.list.clear')}
          </Button>
        )}
      </div>

      {/* ── List ───────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {tab === 'action' && !filtering
            ? t('dashboard.orders.list.nothingToDo')
            : t('dashboard.orders.list.noMatches')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('dashboard.orders.list.columns.request')}</TableHead>
              <TableHead>{t('dashboard.orders.list.columns.customer')}</TableHead>
              <TableHead>{t('dashboard.orders.list.columns.order')}</TableHead>
              <TableHead>{t('dashboard.orders.list.columns.delivery')}</TableHead>
              <TableHead className="text-right">{t('dashboard.orders.list.columns.total')}</TableHead>
              <TableHead>{t('dashboard.orders.list.columns.status')}</TableHead>
              {admin && <TableHead>{t('dashboard.orders.list.columns.todo')}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ order, todos }) => (
              <TableRow
                key={order.id}
                className="cursor-pointer align-top"
                onClick={() => navigate(`/dashboard/orders/${order.id}`)}
              >
                <TableCell>
                  <span className="block font-mono text-xs font-medium">{order.reference}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(order.createdAt)}
                  </span>
                  <span className="block text-xs text-muted-foreground">{originLabel(order, t)}</span>
                </TableCell>
                <TableCell>
                  <span className="block text-sm">
                    {order.billing?.company || order.contact.company || order.contact.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {order.contact.name} · {order.contact.email}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{orderSize(order)}</TableCell>
                <TableCell>
                  <span className="block text-sm">
                    {order.delivery?.neededBy ? formatDate(order.delivery.neededBy) : '—'}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {shippingLabel(order.shippingMethod ?? 'bulk')}
                    {order.delivery?.country ? ` · ${order.delivery.country}` : ''}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {order.totalGross != null ? (
                    <>
                      {formatPrice(order.totalGross, order.currency)}
                      <span className="block text-xs text-muted-foreground">{t('dashboard.orders.list.gross')}</span>
                    </>
                  ) : (
                    <>
                      {formatPrice(order.total, order.currency)}
                      <span className="block text-xs text-muted-foreground">{t('dashboard.orders.list.estNet')}</span>
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant="outline" className={STATUS_STYLE[order.status]}>
                      {t(`dashboard.orders.status.${order.status}`)}
                    </Badge>
                    {order.invoice && order.paymentStatus && (
                      <Badge variant="outline" className={PAYMENT_STYLE[order.paymentStatus]}>
                        {t(`dashboard.orders.payment.${order.paymentStatus}`)}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                {admin && (
                  <TableCell>
                    <div className="flex max-w-[220px] flex-wrap gap-1">
                      {todos.map((todo) => (
                        <span
                          key={todo.key}
                          title={todo.detail}
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                            todo.urgent
                              ? 'border-destructive/40 bg-destructive/10 text-destructive'
                              : 'border-amber-500/40 bg-amber-500/10 text-amber-700',
                          )}
                        >
                          {todo.label}
                        </span>
                      ))}
                      {todos.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
