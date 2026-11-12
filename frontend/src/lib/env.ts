import { z } from 'zod';

/** Public values (safe in the browser). Read via literal process.env access so Next inlines them. */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url(),
});

export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  AI_SERVICE_URL: z.url(),
  AI_SERVICE_SECRET: z.string().min(24, 'AI_SERVICE_SECRET must be at least 24 characters'),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  RATE_LIMIT_URL_PER_HOUR: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_UPLOAD_PER_HOUR: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_VALIDATE_PER_DAY: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_LOGIN_PER_15MIN: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_REGISTER_PER_HOUR: z.coerce.number().int().min(1).default(5),
  MARKETPLACE_USER_AGENT: z.string().default('AR-LOKAL-Preview/0.1 (+product preview; respects robots.txt)'),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/** Server-only secrets. Importing this from a client component fails the build via `server-only` in callers. */
export function serverEnv(): ServerEnv {
  return serverSchema.parse(process.env);
}
