import { useState } from 'react'
import { AxiosError } from 'axios'
import { useAuth } from '@/context/AuthContext'
import {
  useChangeUserRole,
  useCreateUser,
  useSetUserActive,
  useUsers,
} from '@/hooks/use-users'
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

export function TeamPage() {
  const { company } = useAuth()
  const companyId = company?.id
  const usersQuery = useUsers(companyId ? { companyId } : {})
  const createUser = useCreateUser()
  const changeRole = useChangeUserRole()
  const setActive = useSetUserActive()

  const emptyMember = { name: '', email: '', password: '', role: 'member', companyId: '' }
  const f = useZodForm({ schema: newUserSchema, initialValues: emptyMember, idPrefix: 't-' })
  const [formError, setFormError] = useState<string | null>(null)

  async function handleAdd({
    name,
    email,
    password,
    role,
  }: {
    name: string
    email: string
    password: string
    role: string
  }) {
    setFormError(null)
    try {
      await createUser.mutateAsync({ name, email, password, role: role as Role })
      f.reset(emptyMember)
    } catch (err) {
      setFormError(
        err instanceof AxiosError
          ? (err.response?.data?.error ?? 'Failed to add employee')
          : 'Failed to add employee',
      )
    }
  }

  const users = usersQuery.data?.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Team</h1>
        <p className="text-sm text-muted-foreground">
          Manage the people in {company?.name ?? 'your company'}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add a team member</CardTitle>
          <CardDescription>
            They'll be able to sign in and share your company's branded shop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={f.handleSubmit(handleAdd)}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-start"
            noValidate
          >
            <FormField id="t-name" label="Name" error={f.errors.name}>
              <Input {...f.register('name')} autoComplete="off" />
            </FormField>
            <FormField id="t-email" label="Email" error={f.errors.email}>
              <Input {...f.register('email')} type="email" autoComplete="off" />
            </FormField>
            <FormField
              id="t-password"
              label="Temp password"
              error={f.errors.password}
              hint="At least 8 characters."
            >
              <Input {...f.register('password')} type="text" autoComplete="off" />
            </FormField>
            <FormField id="t-role" label="Role" error={f.errors.role}>
              <select {...f.register('role')} className="h-10 w-full rounded-brand border border-input bg-background px-3 text-sm">
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </FormField>
            {/* Lines the button up with the inputs, under their labels. */}
            <div className="space-y-2">
              <span className="hidden h-4 lg:block" aria-hidden />
              <Button type="submit" className="w-full" disabled={createUser.isPending}>
                {createUser.isPending ? 'Adding…' : 'Add member'}
              </Button>
            </div>
          </form>
          <div className="mt-3">
            <FormAlert>{formError}</FormAlert>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Members</CardTitle>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{u.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {u.email}
                      </td>
                      <td className="py-2 pr-4">
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                          value={
                            (ASSIGNABLE_ROLES as string[]).includes(u.role)
                              ? u.role
                              : 'member'
                          }
                          disabled={changeRole.isPending}
                          onChange={(e) =>
                            changeRole.mutate({
                              id: u.id,
                              role: e.target.value as Role,
                            })
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
                        <Button
                          variant={u.isActive ? 'outline' : 'default'}
                          size="sm"
                          disabled={setActive.isPending}
                          onClick={() =>
                            setActive.mutate({
                              id: u.id,
                              isActive: !u.isActive,
                            })
                          }
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
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
