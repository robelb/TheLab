import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { Capability } from '@/lib/roles'

export function RequireAuth({
  children,
  capability,
}: {
  children: React.ReactNode
  /** When set, the user must also pass this capability check. */
  capability?: Capability
}) {
  const { isAuthenticated, isLoading, can } = useAuth()
  const location = useLocation()

  // Wait for the initial /me hydration so a refresh doesn't bounce to login.
  if (isLoading) return null

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Authenticated but lacking the required capability → back to the storefront.
  if (capability && !can(capability)) {
    return <Navigate to="/" replace />
  }

  return children
}
