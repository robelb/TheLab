import { apiClient } from '@/lib/api-client'

export interface NotifySettings {
  /** Who gets the "new request" email. */
  emails: string[]
  /** Saved in the dashboard, or still the server's ORDER_NOTIFY_EMAIL. */
  source: 'dashboard' | 'environment'
  updatedAt: string | null
  /** Whether this server can send email at all. */
  mailerReady: boolean
}

export async function fetchNotifySettings(): Promise<NotifySettings> {
  const { data } = await apiClient.get<NotifySettings>('/settings/notifications')
  return data
}

export async function saveNotifySettings(emails: string[]): Promise<NotifySettings> {
  const { data } = await apiClient.put<NotifySettings>('/settings/notifications', { emails })
  return data
}
