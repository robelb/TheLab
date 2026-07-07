import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useActiveCampaigns } from '@/hooks/use-active-campaigns'
import { cn } from '@/lib/utils'

const ROTATE_MS = 8000

/**
 * Storefront video ad. `slot` fixes the orientation this placement shows:
 * - `hero`  → landscape (wide banner, used on mobile / narrow viewports)
 * - `side`  → portrait  (tall side rail, used on desktop)
 *
 * The video autoplays muted (required for autoplay) and streams progressively
 * (HTTP range) with eager preload so it starts quickly. A tap toggles audio.
 * Videos are ordered by the endpoint (relevance to `category`/`q`, else
 * priority) and rotated. Renders nothing when no active video fits the slot.
 */
export function CampaignVideoAd({
  slot,
  category,
  q,
  className,
}: {
  slot: 'hero' | 'side'
  category?: string
  q?: string
  className?: string
}) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data } = useActiveCampaigns({
    domain: session?.domain ?? undefined,
    category,
    q,
  })

  const wantOrientation = slot === 'hero' ? 'landscape' : 'portrait'
  const videos = (data ?? []).filter(
    (v) => v.videoOrientation === wantOrientation,
  )

  const [index, setIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIndex(0)
  }, [videos.length])
  useEffect(() => {
    if (videos.length <= 1) return
    const id = setInterval(
      () => setIndex((i) => (i + 1) % videos.length),
      ROTATE_MS,
    )
    return () => clearInterval(id)
  }, [videos.length])

  const video = videos.length ? videos[index % videos.length] : undefined

  // Keep the element's muted state in sync (React doesn't reliably reflect the
  // `muted` attribute), and re-apply the viewer's choice after a rotation.
  useEffect(() => {
    const el = videoRef.current
    if (el) el.muted = muted
  }, [muted, video?.videoUrl])

  // Only stream + play while the ad is on screen; pause (stop pulling bytes)
  // when it scrolls out of view.
  useEffect(() => {
    const el = videoRef.current
    const container = containerRef.current
    if (!el || !container) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play().catch(() => {})
        else el.pause()
      },
      { threshold: 0.25 },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [video?.videoUrl])

  if (!video) return null
  const aspect = slot === 'hero' ? 'aspect-video' : 'aspect-[9/16]'

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative overflow-hidden rounded-brand border border-border/40 bg-card/50 shadow-brand',
        className,
      )}
    >
      <div className={cn('relative w-full', aspect)}>
        <video
          ref={videoRef}
          key={video.videoUrl}
          src={video.videoUrl}
          muted
          loop
          playsInline
          preload="none"
          className="h-full w-full object-cover"
        />

        {/* Full-area click target → campaign page (sibling of the audio button,
            not nested, so the two don't conflict). */}
        <button
          type="button"
          onClick={() => navigate(`/campaign/${video.campaignId}`)}
          aria-label={`View campaign: ${video.title}`}
          className="absolute inset-0 z-0 block w-full text-left"
        >
          <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-1 bg-gradient-to-t from-black/70 to-transparent p-3 text-sm font-semibold text-white drop-shadow truncate">
            {video.title}
          </span>
        </button>

        {/* Audio toggle — starts muted, tap to enable sound. */}
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? 'Enable sound' : 'Mute'}
          aria-pressed={!muted}
          className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-2 text-white backdrop-blur transition-colors hover:bg-black/70"
        >
          {muted ? (
            <VolumeX className="size-4" />
          ) : (
            <Volume2 className="size-4" />
          )}
        </button>
      </div>
    </div>
  )
}
