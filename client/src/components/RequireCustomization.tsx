import { Navigate } from 'react-router-dom'
import { useFunnel } from '@/context/FunnelContext'

/**
 * Keeps the builder and the design editor shut inside a buy-only campaign.
 *
 * Hiding the buttons is most of the job, but a URL survives: a bookmark, a
 * shared link, a back button, or a route somebody types. A campaign that was
 * set up to sell finished boxes should not be one typed path away from an
 * editor, so the pages themselves refuse and send the visitor back to what
 * they were actually offered.
 */
export function RequireCustomization({
  children,
}: {
  children: React.ReactNode
}) {
  const { inFunnel, allowCustomization, collectionSlug } = useFunnel()

  if (inFunnel && !allowCustomization) {
    return <Navigate to={collectionSlug ? `/c/${collectionSlug}` : '/'} replace />
  }
  return <>{children}</>
}
