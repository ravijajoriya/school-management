import type { HomeContent } from '@school/shared';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { SiteIconView } from '@/components/common/icons';
import { Badge } from '@/components/ui';
import { dateBadge, formatLongDate, formatTime } from '@/lib/format';
import { mediaUrl, usePublicAnnouncements, usePublicEvents, usePublicPage } from '@/lib/public-api';
import { usePageTitle } from '@/lib/use-page-title';
import {
  CheckList,
  CmsImage,
  Container,
  DateChip,
  PageState,
  PlainText,
  SectionTitle,
} from '../components/parts';

export function HomePage() {
  usePageTitle();
  const home = usePublicPage('home');
  const facilities = usePublicPage('facilities');

  return (
    <PageState isLoading={home.isLoading} isError={home.isError}>
      {home.data && (
        <>
          <HeroCarousel slides={home.data.heroSlides} />
          <Highlights items={home.data.highlights} />
          <AboutSection about={home.data.about} />
          {facilities.data && facilities.data.items.length > 0 && (
            <section className="py-14">
              <Container>
                <SectionTitle
                  title="Our Facilities"
                  action={
                    <Link
                      to="/facilities"
                      className="inline-flex items-center gap-1 rounded-md border border-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-gold-light"
                    >
                      View All Facilities <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  }
                />
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                  {facilities.data.items.slice(0, 5).map((f) => (
                    <div
                      key={f.title}
                      className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                    >
                      <CmsImage imageId={f.imageId} alt={f.title} className="h-28 w-full" />
                      <p className="px-3 py-3 text-center text-sm font-semibold text-brand-navy">
                        {f.title}
                      </p>
                    </div>
                  ))}
                </div>
              </Container>
            </section>
          )}
          <StatsBand stats={home.data.stats} />
          <NewsAndEvents />
        </>
      )}
    </PageState>
  );
}

function HeroCarousel({ slides }: { slides: HomeContent['heroSlides'] }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;

  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(id);
  }, [count]);

  const slide = slides[index % count];
  return (
    <section
      className="relative overflow-hidden bg-brand-navy text-white"
      aria-roledescription="carousel"
    >
      {slide.imageId && (
        <img
          src={mediaUrl(slide.imageId)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-brand-navy-dark/95 via-brand-navy/80 to-brand-navy/30" />
      <Container className="relative py-20 md:py-28">
        <div className="max-w-xl" aria-live="polite">
          <h1 className="text-4xl font-bold leading-tight md:text-6xl">
            {slide.heading}
            {slide.highlight && (
              <>
                <br />
                <span className="text-brand-gold">{slide.highlight}</span>
              </>
            )}
          </h1>
          {slide.text && <p className="mt-6 text-white/90 md:text-lg">{slide.text}</p>}
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/about"
              className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-6 py-3 text-sm font-semibold text-brand-navy-dark hover:bg-brand-gold-dark"
            >
              Know More <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/admissions"
              className="rounded-md border border-white px-6 py-3 text-sm font-semibold hover:bg-white/10"
            >
              Admission Enquiry
            </Link>
          </div>
        </div>
      </Container>
      {count > 1 && (
        <>
          <button
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            className="absolute left-4 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/20 p-2 hover:bg-white/30 md:block"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => setIndex((i) => (i + 1) % count)}
            className="absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/20 p-2 hover:bg-white/30 md:block"
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Slide ${i + 1}`}
                aria-current={i === index % count}
                className={`h-2 rounded-full transition-all ${i === index % count ? 'w-6 bg-brand-gold' : 'w-2 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Highlights({ items }: { items: HomeContent['highlights'] }) {
  if (!items.length) return null;
  return (
    <Container className="relative z-10 -mt-8">
      <div className="grid grid-cols-2 divide-gray-100 rounded-xl border border-gray-100 bg-white shadow-lg sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        {items.map((h) => (
          <div key={h.title} className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <SiteIconView icon={h.icon} className="h-9 w-9 text-brand-gold" />
            <span className="text-sm font-semibold text-brand-navy">{h.title}</span>
          </div>
        ))}
      </div>
    </Container>
  );
}

function AboutSection({ about }: { about: HomeContent['about'] }) {
  return (
    <section className="py-14">
      <Container className="grid items-center gap-10 md:grid-cols-2">
        <CmsImage
          imageId={about.imageId}
          alt="Students at our school"
          className="aspect-[4/3] w-full rounded-xl shadow-md"
        />
        <div>
          <h2 className="text-2xl font-bold text-brand-navy md:text-3xl">{about.heading}</h2>
          <PlainText text={about.text} className="mt-4" />
          {about.points.length > 0 && (
            <div className="mt-6">
              <CheckList items={about.points} />
            </div>
          )}
          <Link
            to="/about"
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-brand-gold px-6 py-2.5 text-sm font-semibold text-brand-navy-dark hover:bg-brand-gold-dark"
          >
            Read More <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </section>
  );
}

function StatsBand({ stats }: { stats: HomeContent['stats'] }) {
  if (!stats.length) return null;
  return (
    <section className="bg-brand-navy py-10 text-white">
      <Container className="grid grid-cols-2 gap-8 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-4">
            <SiteIconView icon={s.icon} className="h-10 w-10 shrink-0 text-brand-gold" />
            <div>
              <div className="text-2xl font-bold md:text-3xl">{s.value}</div>
              <div className="text-sm text-white/80">{s.label}</div>
            </div>
          </div>
        ))}
      </Container>
    </section>
  );
}

function NewsAndEvents() {
  const announcements = usePublicAnnouncements(3);
  const events = usePublicEvents('upcoming', 3);
  return (
    <section className="py-14">
      <Container className="grid gap-10 lg:grid-cols-2">
        <div>
          <SectionTitle title="Recent Announcements" />
          {announcements.data?.length ? (
            <ul className="space-y-3">
              {announcements.data.map((a) => {
                const d = dateBadge(a.publishedAt);
                return (
                  <li key={a.slug}>
                    <Link
                      to={`/announcements/${a.slug}`}
                      className="flex items-center gap-4 rounded-lg border border-gray-100 bg-surface p-3 hover:border-brand-gold"
                    >
                      <DateChip day={d.day} month={d.month} />
                      <span className="flex-1 text-sm font-medium text-ink">{a.title}</span>
                      {a.isNew && <Badge tone="gold">New</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No announcements right now.</p>
          )}
          <Link
            to="/announcements"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-navy hover:underline"
          >
            View All Announcements <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div>
          <SectionTitle title="Upcoming Events" />
          {events.data?.length ? (
            <ul className="space-y-3">
              {events.data.map((e) => {
                const d = dateBadge(e.startsAt);
                return (
                  <li key={e.slug}>
                    <Link
                      to={`/events/${e.slug}`}
                      className="flex items-center gap-4 rounded-lg border border-gray-100 bg-surface p-3 hover:border-brand-gold"
                    >
                      <DateChip day={d.day} month={d.month} />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-ink">
                          {e.title}{' '}
                          {e.status === 'CANCELLED' && <Badge tone="red">Cancelled</Badge>}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {formatLongDate(e.startsAt)} · {formatTime(e.startsAt)}
                          {e.venue ? ` | ${e.venue}` : ''}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No upcoming events right now.</p>
          )}
          <Link
            to="/events"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-navy hover:underline"
          >
            View All Events <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </section>
  );
}
