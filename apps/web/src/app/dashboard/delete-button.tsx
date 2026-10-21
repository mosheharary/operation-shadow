'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/** Deletes a saved slot or generated operation (`url` is its API resource) after a second click to confirm. */
export function DeleteButton({ url, label, testId }: { url: string; label: string; testId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" className="btn btn--ghost menu__delete" onClick={() => setConfirming(true)} aria-label={`Delete ${label}`} data-testid={testId}>
        Delete
      </button>
    );
  }
  return (
    <span className="menu__confirm">
      {error && <span role="alert">{error}</span>}
      <button
        type="button"
        className="btn btn--danger"
        disabled={pending}
        data-testid={`${testId}-confirm`}
        onClick={() =>
          startTransition(async () => {
            const res = await fetch(url, { method: 'DELETE' }).catch(() => null);
            if (!res || (!res.ok && res.status !== 404)) {
              setError('Could not delete it');
              return;
            }
            router.refresh();
          })
        }
      >
        Delete for good
      </button>
      <button type="button" className="btn btn--ghost" disabled={pending} onClick={() => setConfirming(false)}>
        Keep
      </button>
    </span>
  );
}
