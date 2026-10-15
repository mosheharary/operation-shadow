import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import type { Database } from '@operation-shadow/db';
import { isDevLoginEnabled } from './dev-login';
import type { ServerEnv } from './env';

const SEVEN_DAYS = 60 * 60 * 24 * 7;
const ONE_DAY = 60 * 60 * 24;

/**
 * Better Auth configuration shared by the app and the schema-generation CLI.
 * Production: Google sign-in only. Local/test: the dev test-operator login is added
 * (email + password with public sign-up disabled; operators are created by the seed script).
 */
export function buildAuthOptions(env: ServerEnv, db: Database, schema?: Record<string, unknown>) {
  const devLogin = isDevLoginEnabled(env);
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: 'select_account' as const } }
      : undefined;

  return {
    appName: 'Operation Shadow',
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'pg', ...(schema ? { schema } : {}) }),
    emailAndPassword: { enabled: devLogin, disableSignUp: true },
    ...(google ? { socialProviders: google } : {}),
    session: { expiresIn: SEVEN_DAYS, updateAge: ONE_DAY },
    // Database-backed counters: in-memory limits do not work across serverless instances.
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100 },
    advanced: { useSecureCookies: env.BETTER_AUTH_URL.startsWith('https://') },
    telemetry: { enabled: false },
    // nextCookies must stay last so cookies set from server actions are applied.
    plugins: [nextCookies()],
  } satisfies BetterAuthOptions;
}
