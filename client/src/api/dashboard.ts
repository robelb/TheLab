import { apiClient } from '@/lib/api-client'
import type { Category, DashboardStats } from '@/types/dashboard'

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data } = await apiClient.get<DashboardStats>('/dashboard/stats')
  return data
}

export async function fetchCategories(): Promise<Category[]> {
  const { data } = await apiClient.get<{ data: Category[] }>('/categories')
  return data.data
}
