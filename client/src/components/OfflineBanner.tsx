import { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const isOnline = () => navigator.onLine

/**
 * A slim notice while the browser has no connection.
 *
 * Says why buttons have stopped working before anybody presses one. Data that
 * failed to load is fetched again on its own once the connection is back.
 */
export function OfflineBanner() {
  const { t } = useTranslation()
  const online = useSyncExternalStore(subscribe, isOnline, () => true)
  if (online) return null
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-center text-sm text-background print:hidden"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      {t('errors.offlineBanner')}
    </div>
  )
}
