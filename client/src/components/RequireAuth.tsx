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
    // Search too, not just the path. The design editor carries where to return
    // to in its query string, so a sign-in that kept only the pathname would
    // send someone back to the editor with no way out of it.
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  // Authenticated but lacking the required capability → back to the storefront.
  if (capability && !can(capability)) {
    return <Navigate to="/" replace />
  }

  return children
}
