import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { useAuth } from '@/context/AuthContext'
import { useDebounce } from '@/hooks/use-debounce'
import {
  useCompaniesList,
  useCreateCompany,
  useDeleteCompany,
  useReExtractCompany,
} from '@/hooks/use-companies'
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

export function CompaniesPage() {
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 400)
  const companiesQuery = useCompaniesList({ q: debounced || undefined, limit: 100 })
  const createCompany = useCreateCompany()
  const deleteCompany = useDeleteCompany()
  const reExtract = useReExtractCompany()

  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  if (!can('manage_all')) return <Navigate to="/dashboard" replace />

  const companies = companiesQuery.data?.data ?? []

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    try {
      await createCompany.mutateAsync({ name, domain })
      setName('')
      setDomain('')
    } catch (err) {
      setFormError(
        err instanceof AxiosError
          ? (err.response?.data?.error ?? 'Failed to create company')
          : 'Failed to create company',
      )
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">All companies</h1>
        <p className="text-sm text-muted-foreground">
          Every organization on the platform.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create company</CardTitle>
          <CardDescription>
            You can pre-create a company; its brand extracts on first re-extract
            or when its first user signs up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="co-name">Name</Label>
              <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-domain">Domain</Label>
              <Input
                id="co-domain"
                placeholder="acme.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={createCompany.isPending}>
              {createCompany.isPending ? 'Creating…' : 'Create'}
            </Button>
          </form>
          {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle className="text-lg">Companies</CardTitle>
          <Input
            placeholder="Search name or domain…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {companiesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Domain</th>
                    <th className="py-2 pr-4 font-medium">Brand</th>
                    <th className="py-2 pr-4 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{c.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.domain}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline">{c.brandStatus}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={reExtract.isPending}
                            onClick={() => reExtract.mutate(c.id)}
                          >
                            Re-extract
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(`Delete ${c.domain}? This removes its branded images.`))
                                deleteCompany.mutate(c.id)
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
