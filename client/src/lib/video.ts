import type { VideoOrientation } from '@/types/campaign'

export interface VideoMeta {
  orientation: VideoOrientation
  width: number
  height: number
  durationSec: number
}

/**
 * Read a video file's intrinsic dimensions in the browser (no upload, no lib)
 * to determine portrait vs landscape. Square videos count as landscape.
 */
export function readVideoMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const cleanup = () => URL.revokeObjectURL(url)

    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const { videoWidth: width, videoHeight: height, duration } = video
      cleanup()
      if (!width || !height) {
        reject(new Error('Could not read video dimensions'))
        return
      }
      resolve({
        orientation: height > width ? 'portrait' : 'landscape',
        width,
        height,
        durationSec: Number.isFinite(duration) ? duration : 0,
      })
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('Failed to read video metadata'))
    }
    video.src = url
  })
}
