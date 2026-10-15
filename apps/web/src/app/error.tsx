'use client';

import Link from 'next/link';

/** Any unexpected rendering error: a plain message (no internals) and a way back. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="sign-in" role="alert">
      <div className="sign-in__card">
        <p className="eyebrow">Shadow Section</p>
        <h1 className="title">Something went wrong</h1>
        <p className="lede">The page could not be shown. Your saves and progress are safe on the server.</p>
        <div className="sign-in__actions">
          <button type="button" className="btn btn--primary" onClick={reset}>
            Try again
          </button>
          <Link href="/dashboard" className="btn">
            Field HQ
          </Link>
        </div>
      </div>
    </main>
  );
}
