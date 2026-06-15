import {
  AlertTriangle,
  Boxes,
  Package,
  Star,
  Tags,
  Wallet,
  XCircle,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardStats } from '@/hooks/use-dashboard'
import type { DashboardStats } from '@/types/dashboard'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

interface StatCardProps {
  label: string
  value: string | number
  icon: ComponentType<{ className?: string }>
  hint?: string
  accent?: string
}

function StatCard({ label, value, icon: Icon, hint, accent }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="font-display text-2xl font-bold">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span
          className={cnAccent(accent)}
        >
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  )
}

function cnAccent(accent?: string) {
  return [
    'flex size-10 shrink-0 items-center justify-center rounded-brand',
    accent ?? 'bg-primary/10 text-primary',
  ].join(' ')
}

function StatsGrid({ stats }: { stats: DashboardStats }) {
  const { totals, priceRange } = stats
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="Products" value={totals.products} icon={Package} />
      <StatCard label="Categories" value={totals.categories} icon={Tags} />
      <StatCard
        label="Featured"
        value={totals.featured}
        icon={Star}
        accent="bg-amber-500/10 text-amber-600"
      />
      <StatCard
        label="Units in stock"
        value={totals.totalStock.toLocaleString()}
        icon={Boxes}
        hint={`Inventory value ${formatCurrency(totals.inventoryValue)}`}
      />
      <StatCard
        label="Low stock"
        value={totals.lowStock}
        icon={AlertTriangle}
        accent="bg-amber-500/10 text-amber-600"
        hint="Fewer than 10 units"
      />
      <StatCard
        label="Out of stock"
        value={totals.outOfStock}
        icon={XCircle}
        accent="bg-destructive/10 text-destructive"
      />
      <StatCard
        label="Avg. price"
        value={formatCurrency(priceRange.avg)}
        icon={Wallet}
        hint={`${formatCurrency(priceRange.min)} – ${formatCurrency(priceRange.max)}`}
      />
    </div>
  )
}

export function DashboardHomePage() {
  const { data, isLoading, error } = useDashboardStats()

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          A snapshot of your catalog and inventory.
        </p>
      </header>

      {error && (
        <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-brand" />
          ))}
        </div>
      )}

      {data && (
        <>
          <StatsGrid stats={data} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By category</CardTitle>
              </CardHeader>
              <CardContent className="max-h-72 space-y-3 overflow-y-auto">
                {data.categoryBreakdown.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No categories yet.
                  </p>
                )}
                {data.categoryBreakdown.map((c) => {
                  const pct =
                    data.totals.products > 0
                      ? Math.round((c.count / data.totals.products) * 100)
                      : 0
                  return (
                    <div key={c.slug} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">{c.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Recently added</CardTitle>
                <Link
                  to="/dashboard/products"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Manage products
                </Link>
              </CardHeader>
              <CardContent className="max-h-72 space-y-3 overflow-y-auto">
                {data.recentProducts.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No products yet.
                  </p>
                )}
                {data.recentProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <img
                      src={p.image}
                      alt=""
                      className="size-10 shrink-0 rounded-brand border border-border/40 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.category}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {formatCurrency(p.price)}
                      </p>
                      <Badge
                        variant="secondary"
                        className="mt-0.5 text-[10px]"
                      >
                        {p.stock} in stock
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
