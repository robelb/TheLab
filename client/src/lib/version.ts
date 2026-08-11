/**
 * Which build is this? The values are frozen into the bundle at build time by
 * `define` in vite.config.ts, so they describe the deployed artifact — not the
 * machine it's running on. Bump `version` in package.json per release; the
 * commit sha identifies the exact build even when nobody remembered to.
 */
export const BUILD = {
  version: __APP_VERSION__,
  /** Not shown anywhere — kept so analytics can pin an event to a build. */
  sha: __GIT_SHA__,
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

/** Short label for the badge: `v0.1.0 · testing`. */
export function versionLabel(): string {
  const parts = [`v${BUILD.version}`]
  // A release build needs no qualifier — every other build says what it is.
  if (!isProduction) parts.push(BUILD.env)
  return parts.join(' · ')
}

/**
 * What lands on the clipboard: the bare version number, nothing else, so it
 * pastes cleanly into a message or a ticket.
 */
export function versionCopyText(): string {
  return BUILD.version
}

/** Hover detail — the version and what it is, without the git plumbing. */
export function versionDetail(): string {
  const built = BUILD.time ? new Date(BUILD.time).toLocaleString() : 'unknown'
  return [
    `Version:     ${BUILD.version}`,
    `Environment: ${BUILD.env}`,
    `Built:       ${built}`,
  ].join('\n')
}

/** Flat shape for analytics — one property per field, easy to filter on. */
export function versionProperties() {
  return {
    app_version: BUILD.version,
    app_env: BUILD.env,
    app_commit: BUILD.sha || null,
    app_dirty: BUILD.dirty,
    app_built_at: BUILD.time,
    app_mode: BUILD.mode,
  }
}
