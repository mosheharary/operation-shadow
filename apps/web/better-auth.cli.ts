// Entry point for the Better Auth CLI only (`auth generate`), used to (re)generate
// packages/db/src/schema/auth.ts. It builds the same options as the app with a schema-less client.
import { betterAuth } from 'better-auth';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { buildAuthOptions } from './src/server/auth-options';
import { getServerEnv } from './src/server/env';

const env = getServerEnv();
const db = drizzle({ client: new pg.Pool({ connectionString: env.DATABASE_URL }) });

export const auth = betterAuth(buildAuthOptions(env, db as never));
