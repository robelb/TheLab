import { Badge } from '@/components/ui/badge'
import { useOrderEmails } from '@/hooks/use-orders'
import type { OrderEmail } from '@/api/orders'
import { formatDateTime } from '@/utils/format'

const KIND_LABEL: Record<OrderEmail['kind'], string> = {
  'email.order_received': 'Request received · customer',
  'email.order_notify': 'New request · team',
  'email.order_confirmed': 'Confirmation & invoice · customer',
}

const STATUS_STYLE: Record<OrderEmail['status'], string> = {
  sent: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700',
  pending: 'border-amber-500/40 bg-amber-500/10 text-amber-700',
  sending: 'border-amber-500/40 bg-amber-500/10 text-amber-700',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
}

function statusLabel(email: OrderEmail): string {
  if (email.status === 'pending' && email.attempts > 0) return 'retrying'
  if (email.status === 'pending') return 'queued'
  return email.status
}

/**
 * Every email this order has sent or tried to, so a failed send is seen here
 * rather than only in the server's log.
 */
export function OrderEmails({ orderId }: { orderId: string }) {
  const { data: emails, isLoading, error } = useOrderEmails(orderId)
  if (isLoading || (!error && !emails?.length)) return null

  return (
    <section className="space-y-2 print:hidden">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Emails
      </h2>
      {error ? (
        <p className="text-sm text-muted-foreground">Could not load the email log.</p>
      ) : (
        <ul className="divide-y divide-border/40 rounded-brand border border-border/40 text-sm">
          {emails!.map((email) => (
            <li key={email.id} className="space-y-1 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1">{KIND_LABEL[email.kind] ?? email.kind}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(email.sentAt ?? email.createdAt)}
                </span>
                <Badge variant="outline" className={STATUS_STYLE[email.status]}>
                  {statusLabel(email)}
                </Badge>
              </div>
              {email.status !== 'sent' && email.lastError && (
                <p className="text-xs text-destructive">
                  {email.lastError}
                  {email.attempts > 1 && ` (${email.attempts} attempts)`}
                  {email.nextAttemptAt &&
                    ` · next try ${formatDateTime(email.nextAttemptAt)}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
