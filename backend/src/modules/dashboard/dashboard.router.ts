import { Router } from 'express'
import { requireAuth, requireCapability } from '../../middleware/auth.js'
import { ROLES } from '../../lib/roles.js'
import { getDashboardStats } from './dashboard.service.js'

export const dashboardRouter = Router()

// The dashboard's overview: a company's requests — with customers' names — and
// the catalogue figures. For company owners and big little things' admins.
dashboardRouter.use(requireAuth, requireCapability('manage_company'))

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
