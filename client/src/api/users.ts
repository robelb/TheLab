import { apiClient } from '@/lib/api-client'
import type { Role } from '@/lib/roles'
import type { AuthAccount } from '@/types/auth'

export interface ListUsersParams {
  page?: number
  limit?: number
  q?: string
  companyId?: string
}

export interface UsersResponse {
  data: AuthAccount[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export async function fetchUsers(
  params: ListUsersParams = {},
): Promise<UsersResponse> {
  const { data } = await apiClient.get<UsersResponse>('/users', { params })
  return data
}

export async function fetchUser(id: string): Promise<AuthAccount> {
  const { data } = await apiClient.get<AuthAccount>(`/users/${id}`)
  return data
}

export async function createUser(body: {
  name: string
  email: string
  password: string
  role?: Role
  companyId?: string | null
}): Promise<AuthAccount> {
  const { data } = await apiClient.post<AuthAccount>('/users', body)
  return data
}

export async function updateUser(
  id: string,
  body: { name?: string; email?: string },
): Promise<AuthAccount> {
  const { data } = await apiClient.put<AuthAccount>(`/users/${id}`, body)
  return data
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`)
}

export async function changeUserRole(
  id: string,
  role: Role,
): Promise<AuthAccount> {
  const { data } = await apiClient.patch<AuthAccount>(`/users/${id}/role`, {
    role,
  })
  return data
}

export async function changeUserCompany(
  id: string,
  companyId: string | null,
): Promise<AuthAccount> {
  const { data } = await apiClient.patch<AuthAccount>(`/users/${id}/company`, {
    companyId,
  })
  return data
}

export async function setUserActive(
  id: string,
  isActive: boolean,
): Promise<AuthAccount> {
  const { data } = await apiClient.patch<AuthAccount>(`/users/${id}/activate`, {
    isActive,
  })
  return data
}

export async function setUserEmailVerification(
  id: string,
  emailVerified: boolean,
): Promise<AuthAccount> {
  const { data } = await apiClient.patch<AuthAccount>(
    `/users/${id}/email-verification`,
    { emailVerified },
  )
  return data
}

export async function adminResetPassword(
  id: string,
  password: string,
): Promise<void> {
  await apiClient.patch(`/users/${id}/password-reset-admin`, { password })
}
