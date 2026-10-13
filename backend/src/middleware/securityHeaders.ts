import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.js'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Response headers for an API that serves JSON and stored files.
 *
 * - Nothing it returns is a page: a strict CSP with `sandbox` means a stored
 *   file opened directly — an uploaded SVG carrying a script, say — cannot run
 *   anything, and no response may be framed.
 * - `nosniff` stops a browser second-guessing a file's declared type.
 * - Images and videos are fetched cross-origin by the shop, so resources are
 *   explicitly shareable across origins; credentials are not involved.
 * - In production, HTTPS is pinned with HSTS.
 *
 * Written out rather than pulled in from helmet: these are the few that
 * apply to an API, and each says why it is here.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox",
  )
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
}

/**
 * Which websites may call the API from a browser.
 *
 * Locally, any — a developer's shop runs on whatever port is free. In
 * production, the shop's own address (`PUBLIC_SHOP_URL`) and any listed in
 * `CORS_ORIGINS` (comma-separated). Auth is a bearer token rather than a
 * cookie, so this is not what keeps accounts safe — it stops other sites
 * using the API, and its AI endpoints, through their visitors' browsers.
 */
export function corsOrigins(): true | string[] {
  if (!isProduction) return true
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return [...new Set([new URL(env.PUBLIC_SHOP_URL).origin, ...configured])]
}
