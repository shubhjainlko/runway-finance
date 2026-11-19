import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="panel empty-state">
      <h1>Page unavailable</h1>
      <p>This workspace page could not be found.</p>
      <Link className="button primary" href="/">
        Open overview
      </Link>
    </div>
  );
}
