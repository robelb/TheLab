import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/utils'
import { BUILD, versionCopyText, versionDetail, versionLabel } from '@/lib/version'

interface VersionBadgeProps {
  className?: string
  /** `bare` drops the border for tight spots like a header bar. */
  variant?: 'outline' | 'bare'
}

/**
 * Which build the tester is on. Clicking copies the full stamp (commit, branch,
 * build time) so a bug report says exactly what was running — and when the
 * clipboard is unavailable, the stamp is shown so it can be copied by hand.
 */
export function VersionBadge({
  className,
  variant = 'outline',
}: VersionBadgeProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    // Just the version number — it goes straight into a message or a ticket.
    if (await copyText(versionCopyText())) {
      setCopied(true)
      return
    }
    toast.info('Copy this version', {
      description: (
        <pre className="mt-1 font-mono text-xs select-all">
          {versionCopyText()}
        </pre>
      ),
      duration: 15_000,
    })
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={versionDetail()}
      aria-label={`Version ${BUILD.version} — click to copy the version number`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-brand px-2 py-1 font-mono text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
        variant === 'outline' && 'border border-border/40 hover:border-border',
        variant === 'bare' && 'hover:bg-muted/50',
        className,
      )}
    >
      {copied ? (
        <Check className="size-3 text-primary" />
      ) : (
        <Copy className="size-3 opacity-60" />
      )}
      {copied ? 'Copied' : versionLabel()}
    </button>
  )
}
