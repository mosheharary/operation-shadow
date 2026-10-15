// Seeds local/test data. Currently: the dev-only test operators used by the dev login and
// browser tests. Idempotent: existing operators get their password re-synced to DEV_LOGIN_PASSWORD.
import { eq } from 'drizzle-orm';
import { schema } from '@operation-shadow/db';
import { getAuth } from '../src/server/auth';
import { getDb } from '../src/server/db';
import { DEV_OPERATORS, isDevLoginEnabled } from '../src/server/dev-login';
import { getServerEnv } from '../src/server/env';

const env = getServerEnv();
const { db, pool } = getDb();

try {
  if (!isDevLoginEnabled(env)) {
    console.log('[seed] dev login is disabled in this environment; nothing to seed');
  } else if (!env.DEV_LOGIN_PASSWORD) {
    throw new Error('DEV_LOGIN_PASSWORD is required when ALLOW_DEV_LOGIN=true');
  } else {
    const ctx = await getAuth().$context;
    const passwordHash = await ctx.password.hash(env.DEV_LOGIN_PASSWORD);

    for (const operator of DEV_OPERATORS) {
      const [existing] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.email, operator.email))
        .limit(1);

      if (existing) {
        await ctx.internalAdapter.updatePassword(existing.id, passwordHash);
        console.log(`[seed] ${operator.email}: already present (password synced)`);
        continue;
      }

      const created = await ctx.internalAdapter.createUser(
        { email: operator.email, name: operator.name, emailVerified: true },
        { method: 'admin' },
      );
      await ctx.internalAdapter.linkAccount({
        userId: created.id,
        providerId: 'credential',
        accountId: created.id,
        password: passwordHash,
      });
      console.log(`[seed] ${operator.email}: created`);
    }
  }
} catch (err) {
  console.error('[seed] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
