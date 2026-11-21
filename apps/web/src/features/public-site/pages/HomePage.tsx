import { Link } from 'react-router';
import { SITE } from '@/config/site';

/** Baseline home page. The full design (hero carousel, highlights, facilities, stats,
 * announcements, events) is implemented in Phase 2. */
export function HomePage() {
  return (
    <section className="bg-gradient-to-r from-brand-navy-dark to-brand-navy-light text-white">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <h1 className="text-5xl font-bold leading-tight">
          Shaping
          <br />
          <span className="text-brand-gold">Bright Futures</span>
        </h1>
        <p className="mt-6 max-w-xl text-white/90">
          {SITE.name} — a leading RBSE affiliated school providing quality education from Nursery to
          12th.
        </p>
        <div className="mt-8 flex gap-4">
          <Link
            to="/about"
            className="rounded-md bg-brand-gold px-6 py-2.5 text-sm font-semibold text-brand-navy-dark hover:bg-brand-gold-dark"
          >
            Know More
          </Link>
          <Link
            to="/admissions"
            className="rounded-md border border-white px-6 py-2.5 text-sm font-semibold hover:bg-white/10"
          >
            Admission Enquiry
          </Link>
        </div>
      </div>
    </section>
  );
}
