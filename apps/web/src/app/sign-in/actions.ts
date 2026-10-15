'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { recordAuditEvent } from '@operation-shadow/db';
import { getAuth } from '@/server/auth';
import { getDb } from '@/server/db';
import { findDevOperator, isDevLoginEnabled } from '@/server/dev-login';
import { getServerEnv } from '@/server/env';

/** Signs in as a seeded test operator. Only reachable when the dev-login guard allows it. */
export async function devSignIn(formData: FormData): Promise<void> {
  const env = getServerEnv();
  if (!isDevLoginEnabled(env) || !env.DEV_LOGIN_PASSWORD) redirect('/sign-in?error=dev-login-disabled');

  const operator = findDevOperator(String(formData.get('operator') ?? ''));
  if (!operator) redirect('/sign-in?error=unknown-operator');

  let userId: string;
  try {
    const result = await getAuth().api.signInEmail({
      body: { email: operator.email, password: env.DEV_LOGIN_PASSWORD },
      headers: await headers(),
    });
    userId = result.user.id;
  } catch {
    redirect('/sign-in?error=dev-login-failed');
  }

  await recordAuditEvent(getDb().db, { userId, kind: 'dev_login', metadata: { operator: operator.key } });
  redirect('/dashboard');
}
