import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminResetPassword,
  changeUserCompany,
  changeUserRole,
  createUser,
  deleteUser,
  fetchUsers,
  setUserActive,
  setUserEmailVerification,
  updateUser,
  type ListUsersParams,
} from '@/api/users'
import type { Role } from '@/lib/roles'

export const usersKeys = {
  all: ['users'] as const,
  list: (params: ListUsersParams) => ['users', 'list', params] as const,
}

export function useUsers(params: ListUsersParams = {}) {
  return useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => fetchUsers(params),
  })
}

function useInvalidateUsers() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: usersKeys.all })
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (body: Parameters<typeof createUser>[0]) => createUser(body),
    onSuccess: invalidate,
  })
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: Parameters<typeof updateUser>[1]
    }) => updateUser(id, body),
    onSuccess: invalidate,
  })
}

export function useDeleteUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: invalidate,
  })
}

export function useChangeUserRole() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      changeUserRole(id, role),
    onSuccess: invalidate,
  })
}

export function useChangeUserCompany() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: string | null }) =>
      changeUserCompany(id, companyId),
    onSuccess: invalidate,
  })
}

export function useSetUserActive() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setUserActive(id, isActive),
    onSuccess: invalidate,
  })
}

export function useSetUserEmailVerification() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({
      id,
      emailVerified,
    }: {
      id: string
      emailVerified: boolean
    }) => setUserEmailVerification(id, emailVerified),
    onSuccess: invalidate,
  })
}

export function useAdminResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      adminResetPassword(id, password),
  })
}
