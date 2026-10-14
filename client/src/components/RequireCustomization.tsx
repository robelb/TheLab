import { Navigate, useSearchParams } from 'react-router-dom'
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

/**
 * The design editor's door.
 *
 * Designing the box and its stickers is part of building a box, so it is open
 * wherever box building is (`to` absent — the builder's own hand-off). Branding
 * a product on its own (`to=product`) is customising, and stays behind the
 * collection's customisation switch.
 */
export function RequireDesignAccess({ children }: { children: React.ReactNode }) {
  const [searchParams] = useSearchParams()
  const { inFunnel, allowBoxBuilding, collectionSlug } = useFunnel()
  if (searchParams.get('to')) return <RequireCustomization>{children}</RequireCustomization>
  if (inFunnel && !allowBoxBuilding) {
    return <Navigate to={collectionSlug ? `/c/${collectionSlug}` : '/'} replace />
  }
  return <>{children}</>
}
