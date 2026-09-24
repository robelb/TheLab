import { Router } from 'express'
import { optionalAuth } from '../../middleware/auth.js'
import { ROLES } from '../../lib/roles.js'
import { getDashboardStats } from './dashboard.service.js'

export const dashboardRouter = Router()

// Needed to know whose requests to count. The catalogue figures on this page are
// the shared house catalogue and are the same for everyone.
dashboardRouter.use(optionalAuth)

dashboardRouter.get('/stats', async (req, res) => {
  try {
    const stats = await getDashboardStats(
      req.authUser?.companyId ?? null,
      req.authUser?.role === ROLES.SUPER_ADMIN,
    )
    res.json(stats)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to load dashboard stats'
    console.warn('[dashboard] stats failed:', message)
    res.status(500).json({ error: message })
  }
})
