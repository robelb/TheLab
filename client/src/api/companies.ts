import { apiClient } from '@/lib/api-client'
import type { Role } from '@/lib/roles'
import type { AuthCompany } from '@/types/auth'
import type { UsersResponse } from '@/api/users'

export interface ListCompaniesParams {
  page?: number
  limit?: number
  q?: string
}

export interface CompaniesResponse {
  data: AuthCompany[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export async function fetchCompanies(
  params: ListCompaniesParams = {},
): Promise<CompaniesResponse> {
  const { data } = await apiClient.get<CompaniesResponse>('/companies', {
    params,
  })
  return data
}

export async function fetchCompany(id: string): Promise<AuthCompany> {
  const { data } = await apiClient.get<AuthCompany>(`/companies/${id}`)
  return data
}

export async function createCompany(body: {
  name: string
  domain: string
}): Promise<AuthCompany> {
  const { data } = await apiClient.post<AuthCompany>('/companies', body)
  return data
}

export async function updateCompany(
  id: string,
  body: { name?: string; sourceUrl?: string | null },
): Promise<AuthCompany> {
  const { data } = await apiClient.put<AuthCompany>(`/companies/${id}`, body)
  return data
}

export async function deleteCompany(id: string): Promise<void> {
  await apiClient.delete(`/companies/${id}`)
}

export async function updateCompanyBrand(
  id: string,
  brand: Record<string, unknown>,
): Promise<AuthCompany> {
  const { data } = await apiClient.patch<AuthCompany>(`/companies/${id}/brand`, {
    brand,
  })
  return data
}

export async function reExtractCompany(id: string): Promise<AuthCompany> {
  const { data } = await apiClient.post<AuthCompany>(
    `/companies/${id}/re-extract`,
  )
  return data
}

export async function fetchCompanyUsers(
  id: string,
  params: { page?: number; limit?: number; q?: string } = {},
): Promise<UsersResponse> {
  const { data } = await apiClient.get<UsersResponse>(`/companies/${id}/users`, {
    params,
  })
  return data
}

export async function addCompanyUser(
  id: string,
  body: { name: string; email: string; password: string; role?: Role },
): Promise<UsersResponse['data'][number]> {
  const { data } = await apiClient.post(`/companies/${id}/users`, body)
  return data
}

export async function changeCompanyUserRole(
  id: string,
  userId: string,
  role: Role,
): Promise<UsersResponse['data'][number]> {
  const { data } = await apiClient.patch(
    `/companies/${id}/users/${userId}/role`,
    { role },
  )
  return data
}
