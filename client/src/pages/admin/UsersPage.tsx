import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { useAuth } from '@/context/AuthContext'
import { useDebounce } from '@/hooks/use-debounce'
import {
  useChangeUserCompany,
  useChangeUserRole,
  useCreateUser,
  useDeleteUser,
  useSetUserActive,
  useSetUserEmailVerification,
  useUsers,
} from '@/hooks/use-users'
import { useCompaniesList } from '@/hooks/use-companies'
import { ASSIGNABLE_ROLES, ROLE_LABELS, type Role } from '@/lib/roles'
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
import { newUserSchema } from '@/lib/schemas/dashboard'

export function UsersPage() {
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 400)
  const usersQuery = useUsers({ q: debounced || undefined, limit: 100 })
  const companiesQuery = useCompaniesList({ limit: 100 })
  const createUser = useCreateUser()
  const changeRole = useChangeUserRole()
  const changeCompany = useChangeUserCompany()
  const setActive = useSetUserActive()
  const setVerified = useSetUserEmailVerification()
  const deleteUser = useDeleteUser()

  const emptyUser = { name: '', email: '', password: '', role: 'member', companyId: '' }
  const f = useZodForm({ schema: newUserSchema, initialValues: emptyUser, idPrefix: 'u-' })
  const [formError, setFormError] = useState<string | null>(null)

  if (!can('manage_all')) return <Navigate to="/dashboard" replace />

  const users = usersQuery.data?.data ?? []
  const companies = companiesQuery.data?.data ?? []

  async function handleCreate({
    name,
    email,
    password,
    role,
    companyId,
  }: {
    name: string
    email: string
    password: string
    role: string
    companyId: string
  }) {
    setFormError(null)
    try {
      await createUser.mutateAsync({
        name,
        email,
        password,
        role: role as Role,
        companyId: companyId || null,
      })
      f.reset(emptyUser)
    } catch (err) {
      setFormError(
        err instanceof AxiosError
          ? (err.response?.data?.error ?? 'Failed to create user')
          : 'Failed to create user',
      )
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">All users</h1>
        <p className="text-sm text-muted-foreground">
          Manage every user across all companies.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create user</CardTitle>
          <CardDescription>Assign a company and role.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={f.handleSubmit(handleCreate)}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-start"
            noValidate
          >
            <FormField id="u-name" label="Name" error={f.errors.name}>
              <Input {...f.register('name')} autoComplete="off" />
            </FormField>
            <FormField id="u-email" label="Email" error={f.errors.email}>
              <Input {...f.register('email')} type="email" autoComplete="off" />
            </FormField>
            <FormField
              id="u-password"
              label="Password"
              error={f.errors.password}
              hint="At least 8 characters."
            >
              <Input {...f.register('password')} type="text" autoComplete="off" />
            </FormField>
            <FormField id="u-role" label="Role" error={f.errors.role}>
              <select {...f.register('role')} className="h-10 w-full rounded-brand border border-input bg-background px-3 text-sm">
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="u-companyId" label="Company" error={f.errors.companyId} optional>
              <select {...f.register('companyId')} className="h-10 w-full rounded-brand border border-input bg-background px-3 text-sm">
                <option value="">— None —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            {/* Lines the button up with the inputs, under their labels. */}
            <div className="space-y-2">
              <span className="hidden h-4 lg:block" aria-hidden />
              <Button type="submit" className="w-full" disabled={createUser.isPending}>
                {createUser.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
          <div className="mt-3">
            <FormAlert>{formError}</FormAlert>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle className="text-lg">Users</CardTitle>
          <Input
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Company</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">Verified</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{u.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{u.email}</td>
                      <td className="py-2 pr-4">
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                          value={u.companyId ?? ''}
                          onChange={(e) =>
                            changeCompany.mutate({
                              id: u.id,
                              companyId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">— None —</option>
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                          value={
                            (ASSIGNABLE_ROLES as string[]).includes(u.role)
                              ? u.role
                              : 'member'
                          }
                          onChange={(e) =>
                            changeRole.mutate({ id: u.id, role: e.target.value as Role })
                          }
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() =>
                            setVerified.mutate({
                              id: u.id,
                              emailVerified: !u.emailVerified,
                            })
                          }
                        >
                          {u.emailVerified ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td className="py-2 pr-4">
                        <Button
                          variant={u.isActive ? 'outline' : 'default'}
                          size="sm"
                          onClick={() =>
                            setActive.mutate({ id: u.id, isActive: !u.isActive })
                          }
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                      <td className="py-2 pr-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`Delete ${u.email}?`)) deleteUser.mutate(u.id)
                          }}
                        >
                          Delete
                        </Button>
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
