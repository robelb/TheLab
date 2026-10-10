import { Navigate } from 'react-router-dom'
import { useFunnel } from '@/context/FunnelContext'
import { StepBoxBuilderPage } from '@/pages/StepBoxBuilderPage'

/**
 * `/build-box`, as the campaign the visitor is inside allows it.
 *
 * A campaign without box building sends them back to its page — a bookmark or
 * a typed path should not open a builder the page never offered. Everywhere
 * else it is the step-by-step builder, which offers the design tools wherever
 * customising is allowed.
 */
export function BoxBuilderRoute() {
  const { inFunnel, allowBoxBuilding, collectionSlug } = useFunnel()

  if (inFunnel && !allowBoxBuilding) {
    return <Navigate to={collectionSlug ? `/c/${collectionSlug}` : '/'} replace />
  }
  return <StepBoxBuilderPage />
}
