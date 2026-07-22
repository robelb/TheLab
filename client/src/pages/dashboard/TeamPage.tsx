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
import { Label } from '@/components/ui/label'

export function TeamPage() {
  const { company } = useAuth()
  const companyId = company?.id
  const usersQuery = useUsers(companyId ? { companyId } : {})
  const createUser = useCreateUser()
  const changeRole = useChangeUserRole()
  const setActive = useSetUserActive()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [formError, setFormError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    try {
      await createUser.mutateAsync({ name, email, password, role })
      setName('')
      setEmail('')
      setPassword('')
      setRole('member')
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
            onSubmit={handleAdd}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
          >
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Name</Label>
              <Input
                id="t-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-email">Email</Label>
              <Input
                id="t-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-password">Temp password</Label>
              <Input
                id="t-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-role">Role</Label>
              <select
                id="t-role"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? 'Adding…' : 'Add member'}
            </Button>
          </form>
          {formError && (
            <p className="mt-3 text-sm text-destructive">{formError}</p>
          )}
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
