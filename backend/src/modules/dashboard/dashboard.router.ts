import { Router } from 'express'
import { getDashboardStats } from './dashboard.service.js'

export const dashboardRouter = Router()

dashboardRouter.get('/stats', async (_req, res) => {
  try {
    const stats = await getDashboardStats()
    res.json(stats)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to load dashboard stats'
    console.warn('[dashboard] stats failed:', message)
    res.status(500).json({ error: message })
  }
})
