import { PrismaClient } from '@prisma/client';
import { env } from './env';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const isLocal =
    env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1');

  if (!isLocal) {
    // Supabase connection pooler (pgbouncer, transaction mode) requires:
    //   sslmode=require   — TLS to the pooler endpoint
    //   pgbouncer=true    — disables Prisma features pgbouncer can't relay
    //   connection_limit=1 — Prisma opens one connection; pooler multiplexes
    // Append only the params that aren't already in the URL.
    let url = process.env['DATABASE_URL'] ?? '';
    const params = new URLSearchParams();
    if (!url.includes('sslmode=')) params.append('sslmode', 'require');
    if (!url.includes('pgbouncer=')) params.append('pgbouncer', 'true');
    if (!url.includes('connection_limit=')) params.append('connection_limit', '1');
    const qs = params.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
      process.env['DATABASE_URL'] = url;
    }
  }

  return new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
