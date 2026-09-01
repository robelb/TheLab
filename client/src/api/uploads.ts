import { apiClient } from '@/lib/api-client'

/** Read a File into a `data:<mime>;base64,…` string. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export interface UploadOptions {
  /**
   * Knock a white background out to transparency. Worth it for a logo or a
   * piece of artwork going onto a coloured product, where a white rectangle
   * behind the mark is the giveaway that it was pasted on.
   */
  transparent?: boolean
}

/** Upload base64 data-URL images, returning their served URLs (order preserved). */
export async function uploadImages(
  dataUrls: string[],
  options: UploadOptions = {},
): Promise<string[]> {
  const { data } = await apiClient.post<{ urls: string[] }>('/uploads', {
    images: dataUrls,
    ...(options.transparent ? { transparent: true } : {}),
  })
  return data.urls
}

/**
 * Upload a video via multipart FormData (videos are too large for base64/JSON).
 * Returns the stored public URL. Content-Type is left unset so the browser adds
 * the multipart boundary.
 */
export async function uploadVideo(file: File): Promise<string> {
  const form = new FormData()
  form.append('video', file)
  const { data } = await apiClient.post<{ url: string }>('/uploads/video', form, {
    headers: { 'Content-Type': undefined },
  })
  return data.url
}
