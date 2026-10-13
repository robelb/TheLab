import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AxiosError } from 'axios'
import { useAuth } from '@/context/AuthContext'
import { useReExtractCompany, useUpdateCompany } from '@/hooks/use-companies'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FormAlert, FormField } from '@/components/ui/form-field'
import { useZodForm } from '@/lib/form'
import { companyNameSchema } from '@/lib/schemas/dashboard'
import { Badge } from '@/components/ui/badge'

export function CompanySettingsPage() {
  const { t } = useTranslation()
  const { company } = useAuth()
  const updateCompany = useUpdateCompany()
  const reExtract = useReExtractCompany()
  const f = useZodForm({
    schema: companyNameSchema,
    initialValues: { name: company?.name ?? '' },
    idPrefix: 'c-',
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  if (!company) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('dashboard.company.settings.notAttached')}
      </p>
    )
  }

  async function handleSaveName({ name }: { name: string }) {
    setNotice(null)
    setSaveError(null)
    try {
      await updateCompany.mutateAsync({ id: company!.id, body: { name } })
      setNotice(t('dashboard.company.settings.nameSaved'))
    } catch (err) {
      setSaveError(
        err instanceof AxiosError
          ? (err.response?.data?.error ??
              t('dashboard.company.settings.saveNameError'))
          : t('dashboard.company.settings.saveNameError'),
      )
    }
  }

  async function handleReExtract() {
    setNotice(null)
    await reExtract.mutateAsync(company!.id)
    setNotice(t('dashboard.company.settings.refreshed'))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">
          {t('dashboard.company.settings.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.company.settings.subtitle', { company: company.name })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t('dashboard.company.settings.profile')}
          </CardTitle>
          <CardDescription>
            {t('dashboard.company.settings.domain')}{' '}
            <span className="font-medium">{company.domain}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={f.handleSubmit(handleSaveName)}
            className="flex items-start gap-3"
            noValidate
          >
            <FormField
              id="c-name"
              label={t('dashboard.company.settings.companyName')}
              error={f.errors.name}
              className="flex-1"
            >
              <Input {...f.register('name')} />
            </FormField>
            {/* Lines the button up with the input, under its label. */}
            <div className="space-y-2">
              <span className="block h-4" aria-hidden />
              <Button type="submit" disabled={updateCompany.isPending}>
                {updateCompany.isPending
                  ? t('dashboard.company.shared.saving')
                  : t('dashboard.company.settings.save')}
              </Button>
            </div>
          </form>
          <div className="mt-3">
            <FormAlert>{saveError}</FormAlert>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {t('dashboard.company.settings.branding')}
            <Badge variant="outline">
              {t(`dashboard.company.settings.brandStatus.${company.brandStatus}`, {
                defaultValue: company.brandStatus,
              })}
            </Badge>
          </CardTitle>
          <CardDescription>
            {t('dashboard.company.settings.reExtractDescription', {
              domain: company.domain,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {company.brandError && (
            <p className="text-sm text-destructive">{company.brandError}</p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={reExtract.isPending}
            onClick={handleReExtract}
          >
            {reExtract.isPending
              ? t('dashboard.company.settings.refreshing')
              : t('dashboard.company.settings.reExtract')}
          </Button>
        </CardContent>
      </Card>

      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
    </div>
  )
}
