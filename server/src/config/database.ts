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
    // Strip any sslmode from the URL. In pg's ConnectionParameters, parsed
    // connection-string params override explicit options, and recent
    // pg-connection-string aliases `sslmode=require` to `verify-full` —
    // which rejects Supabase's pooler cert chain ("self-signed certificate
    // in certificate chain"). TLS is instead configured via the explicit
    // `ssl` option on pg.Pool (see createPrismaClient).
    url = url.replace(/([?&])sslmode=[^&]*&?/g, '$1').replace(/[?&]$/, '');

    // Supabase connection pooler (pgbouncer, transaction mode) needs:
    //   pgbouncer=true — disables Prisma features pgbouncer can't relay.
    const params = new URLSearchParams();
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
  //
  // Explicit `ssl` configures TLS without strict chain verification, which
  // is required for Supabase's pooler. With no `sslmode` in the URL,
  // pg-connection-string leaves `ssl` untouched and our explicit value wins.
  const pool = new pg.Pool({
    connectionString: url,
    max: isLocal ? 10 : 1,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
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
