import { z } from 'zod'
import { ASSIGNABLE_ROLES } from '../../lib/roles.js'

const assignableRole = z.enum(
  ASSIGNABLE_ROLES as [string, ...string[]],
)

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim()
      return t ? t : undefined
    }),
  companyId: z.string().uuid().optional(),
})

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('A valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: assignableRole.optional(),
  companyId: z.string().uuid().nullable().optional(),
})

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  })

export const changeRoleSchema = z.object({ role: assignableRole })

export const changeCompanySchema = z.object({
  companyId: z.string().uuid().nullable(),
})

export const activateSchema = z.object({ isActive: z.boolean() })

export const emailVerificationSchema = z.object({
  emailVerified: z.boolean(),
})

export const passwordResetSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>
export type CreateUserBody = z.infer<typeof createUserSchema>
export type UpdateUserBody = z.infer<typeof updateUserSchema>
