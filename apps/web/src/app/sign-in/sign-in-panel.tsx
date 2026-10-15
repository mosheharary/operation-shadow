'use client';

import { useState, useTransition } from 'react';
import { authClient } from '@/lib/auth-client';
import { devSignIn } from './actions';

interface SignInPanelProps {
  googleEnabled: boolean;
  devOperators: { key: string; name: string }[];
  errorMessage: string | null;
}

export function SignInPanel({ googleEnabled, devOperators, errorMessage }: SignInPanelProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(errorMessage);

  const signInWithGoogle = () =>
    startTransition(async () => {
      setMessage(null);
      const { error } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/dashboard',
        errorCallbackURL: '/sign-in?error=google',
      });
      if (error) setMessage(error.message ?? 'Google sign-in failed.');
    });

  return (
    <div className="sign-in__actions">
      <button type="button" className="btn btn--primary" disabled={!googleEnabled || pending} onClick={signInWithGoogle}>
        Sign in with Google
      </button>
      {!googleEnabled && <p className="hint">Google sign-in is not configured in this environment.</p>}

      {devOperators.length > 0 && (
        <div className="dev-login" aria-label="Development sign-in">
          <p className="eyebrow">Development only</p>
          {devOperators.map((operator) => (
            <form key={operator.key} action={devSignIn}>
              <input type="hidden" name="operator" value={operator.key} />
              <button type="submit" className="btn">
                Sign in as {operator.name}
              </button>
            </form>
          ))}
        </div>
      )}

      {message && (
        <p role="alert" className="alert">
          {message}
        </p>
      )}
    </div>
  );
}
