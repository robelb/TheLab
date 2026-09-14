import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import { PostHogErrorBoundary, PostHogProvider } from '@posthog/react'
import App from './App.tsx'
import { versionProperties } from '@/lib/version'
// Imported for its side effect, and before the app so the first render already
// has the right language — a flash of English on a German ad landing page is
// the kind of thing a visitor reads as the wrong shop.
import '@/i18n'
import './index.css'

const posthogToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN

posthog.init(posthogToken, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2026-01-30',
})

// Tag every event with the build it came from, so a funnel or a bug can be
// traced back to the exact version the tester was on. `init` bails out before
// setting up storage when the token is missing, and `register` would throw —
// so it's gated on the same condition.
if (posthogToken) posthog.register(versionProperties())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <PostHogErrorBoundary>
        <App />
      </PostHogErrorBoundary>
    </PostHogProvider>
  </StrictMode>,
)
