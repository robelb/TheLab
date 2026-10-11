import { apiClient } from '@/lib/api-client'
import type { AuthBundle, AuthResult } from '@/types/auth'

export async function loginRequest(body: {
  email: string
  password: string
}): Promise<AuthResult> {
  const { data } = await apiClient.post<AuthResult>('/auth/login', body)
  return data
}

export async function fetchMe(): Promise<AuthBundle> {
  const { data } = await apiClient.get<AuthBundle>('/auth/me')
  return data
}

