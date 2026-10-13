import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ProductsPagination } from '@/types/product'

/**
 * The footer under a dashboard table: rows per page, where you are, and the way
 * to the next page. The same one the products table has, so every list in the
 * dashboard pages the same way.
 */
export function TablePagination({
  pagination,
  shown,
  onPageChange,
  onLimitChange,
  pageSizes = [10, 20, 40],
  disabled,
}: {
  pagination: ProductsPagination
  /** Rows on the current page. */
  shown: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
  pageSizes?: readonly number[]
  disabled?: boolean
}) {
  const { t } = useTranslation()
  if (pagination.total === 0) return null
  const first = (pagination.page - 1) * pagination.limit + 1

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t('dashboard.products.pagination.rowsPerPage')}
          </span>
          <Select
            value={String(pagination.limit)}
            onValueChange={(v) => onLimitChange(Number(v))}
          >
            <SelectTrigger size="sm" className="w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          <Trans
            i18nKey="dashboard.products.pagination.showing"
            values={{ from: first, to: first + shown - 1, total: pagination.total }}
            components={{ b: <span className="font-medium text-foreground" /> }}
          />
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {t('dashboard.products.pagination.page', {
            page: pagination.page,
            pages: Math.max(pagination.totalPages, 1),
          })}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!pagination.hasPrevPage || disabled}
          onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
        >
          {t('dashboard.products.pagination.previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!pagination.hasNextPage || disabled}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          {t('dashboard.products.pagination.next')}
        </Button>
      </div>
    </div>
  )
}

/** Paging a list that is already all on the client — see `TablePagination`. */
export function paginate<T>(
  rows: T[],
  page: number,
  limit: number,
): { rows: T[]; pagination: ProductsPagination } {
  const total = rows.length
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit)
  // A page that no longer exists (the last row on it was removed) falls back
  // to the last one that does.
  const current = Math.min(Math.max(page, 1), Math.max(totalPages, 1))
  return {
    rows: rows.slice((current - 1) * limit, current * limit),
    pagination: {
      page: current,
      limit,
      total,
      totalPages,
      hasNextPage: current < totalPages,
      hasPrevPage: current > 1,
    },
  }
}
