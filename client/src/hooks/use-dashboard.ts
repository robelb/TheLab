import { useQuery } from '@tanstack/react-query'
import { fetchCategories, fetchDashboardStats } from '@/api/dashboard'

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: fetchDashboardStats,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 30 * 60 * 1000,
  })
}
