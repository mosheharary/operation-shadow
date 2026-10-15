'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn--ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut();
          router.replace('/sign-in');
          router.refresh();
        })
      }
    >
      Sign out
    </button>
  );
}
