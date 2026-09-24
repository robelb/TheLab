import { useState } from 'react'
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

const STATUS_LABELS: Record<string, string> = {
  pending: 'Extracting…',
  ready: 'Ready',
  failed: 'Failed',
  skipped: 'Skipped',
}

export function CompanySettingsPage() {
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
        You are not attached to a company.
      </p>
    )
  }

  async function handleSaveName({ name }: { name: string }) {
    setNotice(null)
    setSaveError(null)
    try {
      await updateCompany.mutateAsync({ id: company!.id, body: { name } })
      setNotice('Company name saved.')
    } catch (err) {
      setSaveError(
        err instanceof AxiosError
          ? (err.response?.data?.error ?? 'Could not save the name. Please try again.')
          : 'Could not save the name. Please try again.',
      )
    }
  }

  async function handleReExtract() {
    setNotice(null)
    await reExtract.mutateAsync(company!.id)
    setNotice('Branding refreshed. Reload the app to see the new theme applied.')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Company</h1>
        <p className="text-sm text-muted-foreground">
          Manage {company.name}'s profile and branding.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile</CardTitle>
          <CardDescription>
            Domain <span className="font-medium">{company.domain}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={f.handleSubmit(handleSaveName)}
            className="flex items-start gap-3"
            noValidate
          >
            <FormField id="c-name" label="Company name" error={f.errors.name} className="flex-1">
              <Input {...f.register('name')} />
            </FormField>
            {/* Lines the button up with the input, under its label. */}
            <div className="space-y-2">
              <span className="block h-4" aria-hidden />
              <Button type="submit" disabled={updateCompany.isPending}>
                {updateCompany.isPending ? 'Saving…' : 'Save'}
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
            Branding
            <Badge variant="outline">
              {STATUS_LABELS[company.brandStatus] ?? company.brandStatus}
            </Badge>
          </CardTitle>
          <CardDescription>
            Re-run brand extraction to refresh your theme and product mockups
            from {company.domain}.
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
            {reExtract.isPending ? 'Refreshing…' : 'Re-extract branding'}
          </Button>
        </CardContent>
      </Card>

      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
    </div>
  )
}
