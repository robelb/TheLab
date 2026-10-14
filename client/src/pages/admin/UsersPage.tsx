import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import { ADMIN_ASSIGNABLE_ROLES, type Role } from '@/lib/roles'
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
import { notifyError } from '@/lib/notify'

export function UsersPage() {
  const { t } = useTranslation()
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
          ? (err.response?.data?.error ?? t('dashboard.admin.users.createFailed'))
          : t('dashboard.admin.users.createFailed'),
      )
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">{t('dashboard.admin.users.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.admin.users.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('dashboard.admin.users.createTitle')}</CardTitle>
          <CardDescription>{t('dashboard.admin.users.createDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={f.handleSubmit(handleCreate)}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-start"
            noValidate
          >
            <FormField id="u-name" label={t('dashboard.admin.common.name')} error={f.errors.name}>
              <Input {...f.register('name')} autoComplete="off" />
            </FormField>
            <FormField id="u-email" label={t('dashboard.admin.common.email')} error={f.errors.email}>
              <Input {...f.register('email')} type="email" autoComplete="off" />
            </FormField>
            <FormField
              id="u-password"
              label={t('dashboard.admin.users.password')}
              error={f.errors.password}
              hint={t('dashboard.admin.users.passwordHint')}
            >
              <Input {...f.register('password')} type="text" autoComplete="off" />
            </FormField>
            <FormField id="u-role" label={t('dashboard.admin.users.role')} error={f.errors.role}>
              <select {...f.register('role')} className="h-10 w-full rounded-brand border border-input bg-background px-3 text-sm">
                {ADMIN_ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`dashboard.company.team.roles.${r}`)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="u-companyId" label={t('dashboard.admin.users.company')} error={f.errors.companyId} optional>
              <select {...f.register('companyId')} className="h-10 w-full rounded-brand border border-input bg-background px-3 text-sm">
                <option value="">{t('dashboard.admin.common.none')}</option>
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
                {createUser.isPending
                  ? t('dashboard.admin.common.creating')
                  : t('dashboard.admin.common.create')}
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
          <CardTitle className="text-lg">{t('dashboard.admin.users.listTitle')}</CardTitle>
          <Input
            placeholder={t('dashboard.admin.users.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('dashboard.admin.common.loading')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">{t('dashboard.admin.common.name')}</th>
                    <th className="py-2 pr-4 font-medium">{t('dashboard.admin.common.email')}</th>
                    <th className="py-2 pr-4 font-medium">{t('dashboard.admin.users.company')}</th>
                    <th className="py-2 pr-4 font-medium">{t('dashboard.admin.users.role')}</th>
                    <th className="py-2 pr-4 font-medium">{t('dashboard.admin.users.verified')}</th>
                    <th className="py-2 pr-4 font-medium">{t('dashboard.admin.common.status')}</th>
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
                          <option value="">{t('dashboard.admin.common.none')}</option>
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
                          // The user's real role — a super admin used to show as
                          // "member" here, one click away from being demoted.
                          value={u.role}
                          onChange={(e) =>
                            changeRole.mutate(
                              { id: u.id, role: e.target.value as Role },
                              { onError: (err) => notifyError(err, t('dashboard.admin.users.roleFailed')) },
                            )
                          }
                        >
                          {ADMIN_ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`dashboard.company.team.roles.${r}`)}
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
                          {u.emailVerified
                            ? t('dashboard.admin.users.yes')
                            : t('dashboard.admin.users.no')}
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
                          {u.isActive
                            ? t('dashboard.admin.users.deactivate')
                            : t('dashboard.admin.users.activate')}
                        </Button>
                      </td>
                      <td className="py-2 pr-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(t('dashboard.admin.users.confirmDelete', { email: u.email })))
                              deleteUser.mutate(u.id)
                          }}
                        >
                          {t('dashboard.admin.common.delete')}
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
