/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: string
  readonly VITE_PUBLIC_POSTHOG_HOST: string
  /** Labels the build — `testing`, `production`, or anything you deploy under. */
  readonly VITE_APP_ENV?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Build stamp, injected by `define` in vite.config.ts. See @/lib/version.
declare const __APP_VERSION__: string
declare const __GIT_SHA__: string
declare const __GIT_BRANCH__: string
declare const __GIT_DIRTY__: boolean
declare const __BUILD_TIME__: string
declare const __BUILD_MODE__: string
declare const __APP_ENV__: string
