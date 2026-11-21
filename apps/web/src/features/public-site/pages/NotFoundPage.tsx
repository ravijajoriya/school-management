import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <p className="text-sm font-semibold text-brand-gold">404</p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Page not found</h1>
      <Link to="/" className="mt-6 inline-block text-sm font-semibold text-brand-navy underline">
        Back to home
      </Link>
    </section>
  );
}
