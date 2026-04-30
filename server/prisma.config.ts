import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

// Load .env for local dev. In production (Railway) DATABASE_URL is already in
// the environment, so override: false ensures production vars always win.
config({ path: path.join(import.meta.dirname, '.env'), override: false })

export default defineConfig({
  earlyAccess: true,
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env['DATABASE_URL'],
  },
})
