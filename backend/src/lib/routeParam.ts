import type { Request } from 'express'

/**
 * One route parameter, as a string.
 *
 * Express 5 types `req.params` as `string | string[]` on any route with more
 * than one handler, because a pattern can bind a parameter repeatedly. None of
 * ours do — `/:id` is one id — so this narrows it in the one place rather than
 * at every call site, and takes the first value if a caller ever manages to
 * send two.
 */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}
