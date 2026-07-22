import type { ExtractionPayload } from '@/lib/mapExtractionToBrand'
import type { Role } from '@/lib/roles'

export type CompanyBrandStatus = 'pending' | 'ready' | 'failed' | 'skipped'

export interface AuthAccount {
  id: string
  name: string
  email: string
  role: Role
  companyId: string | null
  emailDomain: string | null
  emailVerified: boolean
  isActive: boolean
  isGhost: boolean
  createdAt: string
  updatedAt: string
}

export interface AuthCompany {
  id: string
  name: string
  domain: string
  sourceUrl: string | null
  ownerUserId: string | null
  brand: ExtractionPayload | null
  brandGeneration: string | null
  brandStatus: CompanyBrandStatus
  brandError: string | null
  imagesStatus: CompanyBrandStatus
  imagesError: string | null
  createdAt: string
}

export interface AuthBundle {
  user: AuthAccount
  company: AuthCompany | null
  permissions: { defaults: unknown[]; companyOverrides: unknown[] }
}

export interface AuthResult extends AuthBundle {
  token: string
}
