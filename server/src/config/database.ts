import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { env } from './env';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function buildConnectionString(): string {
  let url = env.DATABASE_URL;
  const isLocal =
    url.includes('localhost') || url.includes('127.0.0.1');

  if (!isLocal) {
    // Supabase connection pooler (pgbouncer, transaction mode) requires:
    //   sslmode=require   — TLS to the pooler endpoint
    //   pgbouncer=true    — disables Prisma features pgbouncer can't relay
    // connection_limit is handled by pool max below (1 for prod)
    const params = new URLSearchParams();
    if (!url.includes('sslmode=')) params.append('sslmode', 'require');
    if (!url.includes('pgbouncer=')) params.append('pgbouncer', 'true');
    const qs = params.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  return url;
}

function createPrismaClient(): PrismaClient {
  const url = buildConnectionString();
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

  // Use max:1 in production so Prisma opens one connection per instance;
  // pgBouncer multiplexes across all Railway replicas.
  const pool = new pg.Pool({ connectionString: url, max: isLocal ? 10 : 1 });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
