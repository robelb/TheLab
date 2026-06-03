import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { env } from '../config/env.js'
import * as schema from './schema/index.js'

export const rawSql = neon(env.DATABASE_URL)

export const db = drizzle(rawSql, { schema })

export type Database = typeof db
