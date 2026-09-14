import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { usePostHog } from '@posthog/react'
import { attributionProperties, captureAttribution } from '@/lib/attribution'

/**
 * Reads the campaign tags off the landing URL, once, on arrival.
 *
 * Mounted inside the router so it sees the real first location. It renders
 * nothing — the tags are kept until a request is sent, which is the moment they
 * become worth something.
 */
export function AttributionCapture() {
  const location = useLocation()
  const posthog = usePostHog()

  useEffect(() => {
    const attribution = captureAttribution({
      pathname: location.pathname,
      search: location.search,
    })
    if (!attribution) return
    // Registered rather than captured: every later event in the session then
    // carries where the visitor came from, so a funnel can be read end to end.
    posthog?.register(attributionProperties(attribution))
    // First touch only — a later navigation must not re-register.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
