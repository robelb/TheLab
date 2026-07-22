import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCompany,
  deleteCompany,
  fetchCompanies,
  reExtractCompany,
  updateCompany,
  updateCompanyBrand,
  type ListCompaniesParams,
} from '@/api/companies'

export const companiesKeys = {
  all: ['companies'] as const,
  list: (params: ListCompaniesParams) => ['companies', 'list', params] as const,
}

export function useCompaniesList(params: ListCompaniesParams = {}) {
  return useQuery({
    queryKey: companiesKeys.list(params),
    queryFn: () => fetchCompanies(params),
  })
}

function useInvalidateCompanies() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: companiesKeys.all })
}

export function useCreateCompany() {
  const invalidate = useInvalidateCompanies()
  return useMutation({
    mutationFn: (body: { name: string; domain: string }) => createCompany(body),
    onSuccess: invalidate,
  })
}

export function useUpdateCompany() {
  const invalidate = useInvalidateCompanies()
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: { name?: string; sourceUrl?: string | null }
    }) => updateCompany(id, body),
    onSuccess: invalidate,
  })
}

export function useDeleteCompany() {
  const invalidate = useInvalidateCompanies()
  return useMutation({
    mutationFn: (id: string) => deleteCompany(id),
    onSuccess: invalidate,
  })
}

export function useReExtractCompany() {
  const invalidate = useInvalidateCompanies()
  return useMutation({
    mutationFn: (id: string) => reExtractCompany(id),
    onSuccess: invalidate,
  })
}

export function useUpdateCompanyBrand() {
  const invalidate = useInvalidateCompanies()
  return useMutation({
    mutationFn: ({
      id,
      brand,
    }: {
      id: string
      brand: Record<string, unknown>
    }) => updateCompanyBrand(id, brand),
    onSuccess: invalidate,
  })
}
