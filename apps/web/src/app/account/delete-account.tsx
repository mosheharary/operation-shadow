'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

/** Permanent deletion, confirmed by typing DELETE. */
export function DeleteAccount() {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/account/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'The account could not be deleted');
      }
      router.replace('/sign-in');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit} aria-labelledby="delete-title" data-testid="delete-account">
      <h2 id="delete-title">Delete account</h2>
      <p>
        This permanently deletes your account and everything it owns: campaigns, mission results, saves, generated operations and
        settings. It cannot be undone.
      </p>
      <label className="hint" htmlFor="confirm-delete">
        Type DELETE to confirm
      </label>
      <input id="confirm-delete" name="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="input" />
      <div>
        <button type="submit" className="btn" disabled={busy || confirm !== 'DELETE'} data-testid="confirm-delete">
          Delete my account
        </button>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
