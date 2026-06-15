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

/** Upload base64 data-URL images, returning their served URLs (order preserved). */
export async function uploadImages(dataUrls: string[]): Promise<string[]> {
  const { data } = await apiClient.post<{ urls: string[] }>('/uploads', {
    images: dataUrls,
  })
  return data.urls
}
