import { betterAuth } from 'better-auth';
import { schema } from '@operation-shadow/db';
import { buildAuthOptions } from './auth-options';
import { getDb } from './db';
import { getServerEnv } from './env';

function createAuth() {
  return betterAuth(buildAuthOptions(getServerEnv(), getDb().db, schema));
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & { __operationShadowAuth?: Auth };

/** Lazily created so that importing this module never requires runtime secrets (e.g. during build). */
export function getAuth(): Auth {
  globalForAuth.__operationShadowAuth ??= createAuth();
  return globalForAuth.__operationShadowAuth;
}

export function isGoogleSignInConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
