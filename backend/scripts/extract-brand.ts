#!/usr/bin/env node
/**
 * CLI: extract brand JSON for a URL (stdout or --out file).
 * Usage: pnpm extract -- airbnb.com [--out result.json]
 */
import { config } from 'dotenv'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze } from '../src/extractor/analyze.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

function parseArgs(argv: string[]): { url?: string; out?: string } {
  const result: { url?: string; out?: string } = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out' || arg === '-o') {
      result.out = argv[++i]
    } else if (!arg.startsWith('-') && !result.url) {
      result.url = arg
    }
  }
  return result
}

async function main(): Promise<void> {
  const { url, out } = parseArgs(process.argv.slice(2))

  if (!url) {
    console.error('Usage: pnpm extract -- <url> [--out result.json]')
    console.error('Example: pnpm extract -- airbnb.com')
    process.exit(1)
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('Missing GEMINI_API_KEY. Set it in backend/.env')
    process.exit(1)
  }

  const model = process.env.GEMINI_MODEL

  console.error(`Fetching and analyzing ${url} ...`)
  try {
    const result = await analyze(url, apiKey, model)
    const json = JSON.stringify(result, null, 2)

    if (out) {
      await writeFile(out, json, 'utf8')
      console.error(`Wrote result to ${out}`)
    }
    console.log(json)
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`)
    process.exit(1)
  }
}

void main()
