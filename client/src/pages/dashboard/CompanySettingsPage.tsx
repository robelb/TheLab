import { useState } from 'react'
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
import { Label } from '@/components/ui/label'
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
  const [name, setName] = useState(company?.name ?? '')
  const [notice, setNotice] = useState<string | null>(null)

  if (!company) {
    return (
      <p className="text-sm text-muted-foreground">
        You are not attached to a company.
      </p>
    )
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    setNotice(null)
    await updateCompany.mutateAsync({ id: company!.id, body: { name } })
    setNotice('Company name saved.')
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
          <form onSubmit={handleSaveName} className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="c-name">Company name</Label>
              <Input
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={updateCompany.isPending}>
              Save
            </Button>
          </form>
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
