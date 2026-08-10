/**
 * Which build is this? The values are frozen into the bundle at build time by
 * `define` in vite.config.ts, so they describe the deployed artifact — not the
 * machine it's running on. Bump `version` in package.json per release; the
 * commit sha identifies the exact build even when nobody remembered to.
 */
export const BUILD = {
  version: __APP_VERSION__,
  sha: __GIT_SHA__,
  branch: __GIT_BRANCH__,
  /** Built with uncommitted changes — the sha alone doesn't reproduce it. */
  dirty: __GIT_DIRTY__,
  time: __BUILD_TIME__,
  /**
   * What this build is *for*: `testing` for anything a tester is looking at
   * (the dev server included), `production` only for a real release build.
   * Set `VITE_APP_ENV` to label a deploy as anything else.
   */
  env: __APP_ENV__,
  /** How Vite built it — kept separate from `env`, which is the label. */
  mode: __BUILD_MODE__,
} as const

export const isProduction = BUILD.env === 'production'

/** Short label for the badge: `v0.1.0 · a3f9c2d · testing`. */
export function versionLabel(): string {
  const parts = [`v${BUILD.version}`]
  if (BUILD.sha) parts.push(BUILD.sha + (BUILD.dirty ? '*' : ''))
  // A release build needs no qualifier — every other build says what it is.
  if (!isProduction) parts.push(BUILD.env)
  return parts.join(' · ')
}

/** Everything worth pasting into a bug report. */
export function versionDetail(): string {
  const built = BUILD.time ? new Date(BUILD.time).toLocaleString() : 'unknown'
  const lines = [
    `Version:     ${BUILD.version}`,
    `Environment: ${BUILD.env}`,
    `Commit:      ${BUILD.sha || 'unknown'}${BUILD.dirty ? ' (uncommitted changes)' : ''}`,
    `Branch:      ${BUILD.branch || 'unknown'}`,
    `Built:       ${built}`,
    `Build mode:  ${BUILD.mode}`,
  ]
  return lines.join('\n')
}

/** Flat shape for analytics — one property per field, easy to filter on. */
export function versionProperties() {
  return {
    app_version: BUILD.version,
    app_env: BUILD.env,
    app_commit: BUILD.sha || null,
    app_branch: BUILD.branch || null,
    app_dirty: BUILD.dirty,
    app_built_at: BUILD.time,
    app_mode: BUILD.mode,
  }
}
