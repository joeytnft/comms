import path from 'node:path'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  earlyAccess: true,
  schema: path.join('prisma', 'schema.prisma'),
  migrate: {
    async adapter(env) {
      const { Pool } = await import('pg')
      const { PrismaPg } = await import('@prisma/adapter-pg')
      const ssl = env['DATABASE_URL']?.includes('localhost') || env['DATABASE_URL']?.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false }
      const pool = new Pool({ connectionString: env['DATABASE_URL'], ssl })
      return new PrismaPg(pool)
    },
  },
})
