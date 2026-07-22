#!/usr/bin/env node
/**
 * CLI: composite brand logo onto featured product print areas (OpenAI or Gemini).
 * Usage: pnpm customize [--logo <url>] [--domain <site>] [--api-url http://localhost:3001]
 */
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { companies } from '../src/db/schema/index.js'
import { runCustomize } from '../src/customizer/runCustomize.js'
import { resolveBrandAssets } from '../src/customizer/resolveLogoUrl.js'
import {
  missingImageLlmConfigMessage,
  resolveImageLlmConfig,
} from '../src/customizer/llmImageConfig.js'
import {
  missingLlmConfigMessage,
  resolveLlmConfig,
} from '../src/extractor/llmConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

function parseArgs(argv: string[]): {
  logo?: string
  domain?: string
  apiUrl?: string
} {
  const result: { logo?: string; domain?: string; apiUrl?: string } = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--logo' || arg === '-l') {
      result.logo = argv[++i]
    } else if (arg === '--domain' || arg === '-d') {
      result.domain = argv[++i]
    } else if (arg === '--api-url') {
      result.apiUrl = argv[++i]
    }
  }
  return result
}

async function main(): Promise<void> {
  const { logo, domain, apiUrl } = parseArgs(process.argv.slice(2))

  const imageLlm = resolveImageLlmConfig()
  if (!imageLlm) {
    console.error(missingImageLlmConfigMessage())
    process.exit(1)
  }

  const textLlm = resolveLlmConfig()
  if (domain && !logo && !textLlm) {
    console.error(missingLlmConfigMessage())
    process.exit(1)
  }

  if (!domain) {
    console.error('Error: --domain is required to resolve the owning company.')
    process.exit(1)
  }

  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.domain, domain))
    .limit(1)

  if (!company) {
    console.error(`Error: no company found for domain "${domain}".`)
    process.exit(1)
  }

  try {
    const brand = await resolveBrandAssets({
      explicitLogoUrl: logo,
      domain,
      llm: textLlm ?? undefined,
    })
    console.error('Brand assets:', brand)

    const outcome = await runCustomize({
      companyId: company.id,
      domain,
      companyName: brand.companyName,
      logoImageUrl: brand.logoImageUrl,
      faviconImageUrl: brand.faviconImageUrl,
      imageLlm,
      publicApiUrl: apiUrl,
    })

    if (outcome.failures.length > 0) {
      console.error('Failures:', outcome.failures)
    }

    console.log(JSON.stringify(outcome, null, 2))

    if (outcome.results.length === 0) {
      process.exit(1)
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`)
    process.exit(1)
  }
}

void main()
