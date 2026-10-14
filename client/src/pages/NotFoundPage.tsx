import { useTranslation } from 'react-i18next'
import { ErrorState } from '@/components/ErrorState'
import { useFunnel } from '@/context/FunnelContext'

/** Any address the shop does not have. */
export function NotFoundPage() {
  const { t } = useTranslation()
  const { shopHome, inFunnel } = useFunnel()
  return (
    <ErrorState
      kind="notFound"
      homeTo={shopHome}
      homeLabel={inFunnel ? t('common.backToCollection') : undefined}
    />
  )
}

/** Any dashboard address that does not exist. */
export function DashboardNotFoundPage() {
  const { t } = useTranslation()
  return (
    <ErrorState
      kind="notFound"
      body={t('errors.page.notFound.dashboardBody')}
      homeTo="/dashboard"
      homeLabel={t('errors.actions.backToDashboard')}
    />
  )
}
