/** Temporary page body for routes whose feature is scheduled in a later phase. */
export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-bold text-brand-navy">{title}</h1>
      <p className="mt-3 text-ink-muted">This page is built in {phase}.</p>
    </section>
  );
}
