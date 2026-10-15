import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isGoogleSignInConfigured } from '@/server/auth';
import { DEV_OPERATORS, isDevLoginEnabled } from '@/server/dev-login';
import { getServerEnv } from '@/server/env';
import { getSession } from '@/server/session';
import { SignInPanel } from './sign-in-panel';

// Session-dependent: always rendered per request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in' };

const ERROR_MESSAGES: Record<string, string> = {
  google: 'Google sign-in did not complete. Please try again.',
  'dev-login-disabled': 'Development sign-in is not available in this environment.',
  'dev-login-failed': 'Development sign-in failed. Run the seed step (make seed) and try again.',
  'unknown-operator': 'Unknown test operator.',
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect('/dashboard');
  const { error } = await searchParams;
  const devOperators = isDevLoginEnabled(getServerEnv()) ? DEV_OPERATORS.map(({ key, name }) => ({ key, name })) : [];

  return (
    <main className="sign-in">
      <section className="sign-in__card" aria-labelledby="sign-in-title">
        <p className="eyebrow">Shadow Section · Field HQ</p>
        <h1 id="sign-in-title" className="title">
          Operation Shadow
        </h1>
        <p className="lede">Command a six-person special-operations squad behind enemy lines. Sign in to continue.</p>
        <SignInPanel
          googleEnabled={isGoogleSignInConfigured()}
          devOperators={devOperators}
          errorMessage={error ? (ERROR_MESSAGES[error] ?? 'Sign-in failed. Please try again.') : null}
        />
      </section>
    </main>
  );
}
