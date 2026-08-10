import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteSystemInstruction,
  fetchSystemInstructions,
  saveSystemInstruction,
} from '@/api/systemInstructions'

const KEY = ['system-instructions'] as const

export function useSystemInstructions() {
  return useQuery({ queryKey: KEY, queryFn: fetchSystemInstructions })
}

export function useSaveSystemInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      key,
      content,
      isActive,
    }: {
      key: string
      content: string
      isActive?: boolean
    }) => saveSystemInstruction(key, { content, isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteSystemInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => deleteSystemInstruction(key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}
