import { apiClient } from '@/lib/api-client'

export interface InstructionPlaceholder {
  name: string
  description: string
}

export interface InstructionOverride {
  content: string
  isActive: boolean
  updatedAt: string
  createdAt: string
}

/** One AI prompt: its built-in template plus the optional admin override. */
export interface SystemInstructionView {
  key: string
  title: string
  description: string
  placeholders: InstructionPlaceholder[]
  defaultTemplate: string
  override: InstructionOverride | null
}

export async function fetchSystemInstructions(): Promise<
  SystemInstructionView[]
> {
  const { data } = await apiClient.get<{ data: SystemInstructionView[] }>(
    '/system-instructions',
  )
  return data.data
}

export async function saveSystemInstruction(
  key: string,
  input: { content: string; isActive?: boolean },
): Promise<SystemInstructionView> {
  const { data } = await apiClient.put<SystemInstructionView>(
    `/system-instructions/${encodeURIComponent(key)}`,
    input,
  )
  return data
}

export async function deleteSystemInstruction(key: string): Promise<void> {
  await apiClient.delete(`/system-instructions/${encodeURIComponent(key)}`)
}
