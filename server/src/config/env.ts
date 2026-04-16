import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),

  // JWT
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Supabase (database + file storage)
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(32),
  SUPABASE_STORAGE_BUCKET: z.string().default('uploads'),

  // LiveKit (optional until PTT is implemented)
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_URL: z.string().url().optional(),

  // RevenueCat (optional — dev works without them)
  REVENUECAT_API_KEY: z.string().optional(),
  REVENUECAT_WEBHOOK_SECRET: z.string().optional(),

  // CORS (comma-separated origins for production)
  CORS_ORIGINS: z.string().optional(),

  // Planning Center OAuth
  PCO_CLIENT_ID: z.string().optional(),
  PCO_CLIENT_SECRET: z.string().optional(),
  PCO_REDIRECT_URI: z.string().url().optional().default('https://gathersafeapp.com/integrations/pco/callback'),

  // Email (SMTP for password reset)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('GatherSafe <noreply@gathersafeapp.com>'),
  APP_URL: z.string().url().default('https://gathersafeapp.com'),

  // Server
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('debug'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
