import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNotifySettings, saveNotifySettings } from '@/api/settings'

const NOTIFY_KEY = ['settings', 'notifications'] as const

export function useNotifySettings() {
  return useQuery({ queryKey: NOTIFY_KEY, queryFn: fetchNotifySettings })
}

export function useSaveNotifySettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveNotifySettings,
    onSuccess: (data) => queryClient.setQueryData(NOTIFY_KEY, data),
  })
}
