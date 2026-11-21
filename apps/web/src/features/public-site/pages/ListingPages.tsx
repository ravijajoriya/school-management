import { GALLERY_CATEGORIES, MEDIA_CATEGORY_LABELS, type PublicMedia } from '@school/shared';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge, EmptyState } from '@/components/ui';
import { dateBadge, formatLongDate, formatTime } from '@/lib/format';
import {
  useGallery,
  usePublicAnnouncement,
  usePublicAnnouncements,
  usePublicEvent,
  usePublicEvents,
} from '@/lib/public-api';
import { usePageTitle } from '@/lib/use-page-title';
import { Container, DateChip, PageBanner, PageState, PlainText } from '../components/parts';

// --- Gallery ----------------------------------------------------------------------------

export function GalleryPage() {
  usePageTitle('Gallery');
  const [category, setCategory] = useState<string | undefined>();
  const [open, setOpen] = useState<number | null>(null);
  const gallery = useGallery(category);
  const items = gallery.data ?? [];

  return (
    <>
      <PageBanner title="Gallery" />
      <Container className="py-12">
        <div
          className="mb-8 flex flex-wrap justify-center gap-2"
          role="tablist"
          aria-label="Photo categories"
        >
          {[undefined, ...GALLERY_CATEGORIES].map((c) => (
            <button
              key={c ?? 'all'}
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                category === c
                  ? 'bg-brand-navy text-white'
                  : 'bg-surface text-ink hover:bg-brand-gold-light'
              }`}
            >
              {c ? MEDIA_CATEGORY_LABELS[c] : 'All'}
            </button>
          ))}
        </div>
        <PageState isLoading={gallery.isLoading} isError={gallery.isError}>
          {items.length === 0 ? (
            <EmptyState title="No photos yet" description="Photos will appear here soon." />
          ) : (
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {items.map((m, i) => (
                <li key={m.id}>
                  <button
                    onClick={() => setOpen(i)}
                    className="group block w-full overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-brand-gold"
                  >
                    <img
                      src={m.url}
                      alt={m.altText || m.title || 'School photo'}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PageState>
      </Container>
      {open !== null && items[open] && (
        <Lightbox items={items} index={open} onChange={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function Lightbox({
  items,
  index,
  onChange,
  onClose,
}: {
  items: PublicMedia[];
  index: number;
  onChange: (i: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const prev = () => onChange((index - 1 + items.length) % items.length);
  const next = () => onChange((index + 1) % items.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onChange((index - 1 + items.length) % items.length);
      if (e.key === 'ArrowRight') onChange((index + 1) % items.length);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, items.length, onChange, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full p-2 text-white hover:bg-white/10"
        aria-label="Close"
      >
        <X className="h-6 w-6" />
      </button>
      {items.length > 1 && (
        <button
          onClick={prev}
          className="absolute left-2 rounded-full p-2 text-white hover:bg-white/10 md:left-6"
          aria-label="Previous photo"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}
      <figure className="max-h-full max-w-5xl">
        <img
          src={item.url}
          alt={item.altText || item.title || 'School photo'}
          className="max-h-[80vh] rounded-lg object-contain"
        />
        {item.title && (
          <figcaption className="mt-3 text-center text-sm text-white/90">{item.title}</figcaption>
        )}
      </figure>
      {items.length > 1 && (
        <button
          onClick={next}
          className="absolute right-2 rounded-full p-2 text-white hover:bg-white/10 md:right-6"
          aria-label="Next photo"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}
    </div>
  );
}

// --- Events -----------------------------------------------------------------------------

export function EventsPage() {
  usePageTitle('Events');
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const events = usePublicEvents(when, 50);
  return (
    <>
      <PageBanner title="Events" />
      <Container className="max-w-4xl py-12">
        <div className="mb-6 flex gap-2" role="tablist" aria-label="Event period">
          {(['upcoming', 'past'] as const).map((w) => (
            <button
              key={w}
              role="tab"
              aria-selected={when === w}
              onClick={() => setWhen(w)}
              className={`rounded-full px-5 py-2 text-sm font-medium ${
                when === w
                  ? 'bg-brand-navy text-white'
                  : 'bg-surface text-ink hover:bg-brand-gold-light'
              }`}
            >
              {w === 'upcoming' ? 'Upcoming' : 'Past'}
            </button>
          ))}
        </div>
        <PageState isLoading={events.isLoading} isError={events.isError}>
          {!events.data?.length ? (
            <EmptyState title={when === 'upcoming' ? 'No upcoming events' : 'No past events'} />
          ) : (
            <ul className="space-y-4">
              {events.data.map((e) => {
                const d = dateBadge(e.startsAt);
                return (
                  <li key={e.slug}>
                    <Link
                      to={`/events/${e.slug}`}
                      className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-brand-gold"
                    >
                      <DateChip day={d.day} month={d.month} />
                      <div className="min-w-0">
                        <h2 className="font-semibold text-brand-navy">
                          {e.title}{' '}
                          {e.status === 'CANCELLED' && <Badge tone="red">Cancelled</Badge>}
                        </h2>
                        <p className="mt-1 text-sm text-ink-muted">
                          {formatLongDate(e.startsAt)} · {formatTime(e.startsAt)}
                          {e.venue ? ` | ${e.venue}` : ''}
                        </p>
                        {e.description && (
                          <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
                            {e.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </PageState>
      </Container>
    </>
  );
}

export function EventDetailPage() {
  const { slug = '' } = useParams();
  const event = usePublicEvent(slug);
  usePageTitle(event.data?.title ?? 'Event');
  return (
    <>
      <PageBanner
        title={event.data?.title ?? 'Event'}
        crumbs={[{ to: '/events', label: 'Events' }]}
      />
      <Container className="max-w-3xl py-12">
        <PageState isLoading={event.isLoading} isError={false}>
          {event.data ? (
            <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              {event.data.status === 'CANCELLED' && (
                <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-800">
                  This event has been cancelled.
                </p>
              )}
              <ul className="space-y-2 text-sm text-ink">
                <li className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-brand-gold" aria-hidden="true" />
                  {formatLongDate(event.data.startsAt)}
                  {event.data.endsAt &&
                    formatLongDate(event.data.endsAt) !== formatLongDate(event.data.startsAt) &&
                    ` – ${formatLongDate(event.data.endsAt)}`}
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-brand-gold" aria-hidden="true" />
                  {formatTime(event.data.startsAt)}
                  {event.data.endsAt && ` – ${formatTime(event.data.endsAt)}`}
                </li>
                {event.data.venue && (
                  <li className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-brand-gold" aria-hidden="true" />
                    {event.data.venue}
                  </li>
                )}
              </ul>
              {event.data.description && (
                <PlainText text={event.data.description} className="mt-6" />
              )}
            </article>
          ) : (
            <NotFound backTo="/events" label="events" />
          )}
        </PageState>
      </Container>
    </>
  );
}

// --- Announcements ----------------------------------------------------------------------

export function AnnouncementsPage() {
  usePageTitle('Announcements');
  const list = usePublicAnnouncements(50);
  return (
    <>
      <PageBanner title="Announcements" />
      <Container className="max-w-4xl py-12">
        <PageState isLoading={list.isLoading} isError={list.isError}>
          {!list.data?.length ? (
            <EmptyState title="No announcements right now" />
          ) : (
            <ul className="space-y-4">
              {list.data.map((a) => {
                const d = dateBadge(a.publishedAt);
                return (
                  <li key={a.slug}>
                    <Link
                      to={`/announcements/${a.slug}`}
                      className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-brand-gold"
                    >
                      <DateChip day={d.day} month={d.month} />
                      <div className="min-w-0">
                        <h2 className="font-semibold text-brand-navy">
                          {a.title} {a.isNew && <Badge tone="gold">New</Badge>}
                        </h2>
                        <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{a.body}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </PageState>
      </Container>
    </>
  );
}

export function AnnouncementDetailPage() {
  const { slug = '' } = useParams();
  const item = usePublicAnnouncement(slug);
  usePageTitle(item.data?.title ?? 'Announcement');
  return (
    <>
      <PageBanner
        title={item.data?.title ?? 'Announcement'}
        crumbs={[{ to: '/announcements', label: 'Announcements' }]}
      />
      <Container className="max-w-3xl py-12">
        <PageState isLoading={item.isLoading} isError={false}>
          {item.data ? (
            <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-ink-muted">
                Published {formatLongDate(item.data.publishedAt)}
              </p>
              <PlainText text={item.data.body} className="mt-4 text-ink" />
            </article>
          ) : (
            <NotFound backTo="/announcements" label="announcements" />
          )}
        </PageState>
      </Container>
    </>
  );
}

function NotFound({ backTo, label }: { backTo: string; label: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-ink-muted">This item is no longer available.</p>
      <Link
        to={backTo}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to all {label}
      </Link>
    </div>
  );
}
