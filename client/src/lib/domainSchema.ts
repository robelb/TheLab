import { z } from 'zod'

/** Strip protocol, path, and optional www. prefix for validation. */
export function normalizeDomainInput(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./i, '')
    .toLowerCase()
}

const domainRegex =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

const localhostRegex = /^localhost(?::\d{1,5})?$/i

export const domainInputSchema = z.object({
  domain: z
    .string()
    .min(1, 'Domain is required')
    .transform(normalizeDomainInput)
    .refine(
      (d) => domainRegex.test(d) || localhostRegex.test(d),
      'Enter a valid domain (e.g. airbnb.com)',
    ),
})

export type DomainInput = z.infer<typeof domainInputSchema>
