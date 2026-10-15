import { z } from 'zod';
import { assertDevLoginSafe } from './dev-login';

const optional = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const serverEnvSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'preview', 'production']).default('local'),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  BETTER_AUTH_SECRET: z.string().min(16, 'BETTER_AUTH_SECRET must be at least 16 characters'),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  ALLOW_DEV_LOGIN: z.enum(['true', 'false']).optional(),
  DEV_LOGIN_PASSWORD: optional,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Validated server-only configuration. Parsed lazily so `next build` does not need runtime secrets.
 * Throws a message that names the missing variables but never echoes their values.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid server environment: ${problems}`);
  }
  assertDevLoginSafe(parsed.data);
  cached = parsed.data;
  return cached;
}
