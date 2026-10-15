import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="sign-in">
      <div className="sign-in__card">
        <p className="eyebrow">Shadow Section</p>
        <h1 className="title">Nothing here</h1>
        <p className="lede">That page or operation does not exist, or it belongs to someone else.</p>
        <Link href="/dashboard" className="btn btn--primary">
          Back to Field HQ
        </Link>
      </div>
    </main>
  );
}
