import { Eye, Flag, Gem, GraduationCap } from 'lucide-react';
import { SiteIconView } from '@/components/common/icons';
import { usePublicClasses, usePublicPage } from '@/lib/public-api';
import { usePageTitle } from '@/lib/use-page-title';
import {
  CmsImage,
  Container,
  PageBanner,
  PageState,
  PlainText,
  SectionTitle,
  SideNav,
} from '../components/parts';

// --- About Us ---------------------------------------------------------------------------

export function AboutPage() {
  usePageTitle('About Us');
  const { data, isLoading, isError } = usePublicPage('about');
  const nav = [
    { id: 'about-school', label: 'About Our School' },
    { id: 'vision', label: 'Our Vision' },
    { id: 'mission', label: 'Our Mission' },
    ...(data?.principal.message ? [{ id: 'principal', label: "Principal's Message" }] : []),
    ...(data?.coreValues.length ? [{ id: 'values', label: 'Our Core Values' }] : []),
  ];
  return (
    <>
      <PageBanner title="About Us" />
      <PageState isLoading={isLoading} isError={isError}>
        {data && (
          <Container className="grid gap-8 py-12 lg:grid-cols-[240px_1fr]">
            <aside>
              <SideNav items={nav} />
            </aside>
            <div className="space-y-12">
              <section
                id="about-school"
                className="grid scroll-mt-28 items-start gap-6 md:grid-cols-[1fr_280px]"
              >
                <div>
                  <h2 className="text-2xl font-bold text-brand-navy">{data.intro.heading}</h2>
                  <PlainText text={data.intro.text} className="mt-4" />
                </div>
                <CmsImage
                  imageId={data.intro.imageId}
                  alt="Our school campus"
                  className="aspect-[4/3] w-full rounded-lg shadow"
                />
              </section>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { href: '#vision', label: 'Our Vision', Icon: Eye },
                  { href: '#mission', label: 'Our Mission', Icon: Flag },
                  { href: '#values', label: 'Our Values', Icon: Gem },
                ].map(({ href, label, Icon }) => (
                  <a
                    key={href}
                    href={href}
                    className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white py-6 shadow-sm hover:border-brand-gold"
                  >
                    <Icon className="h-8 w-8 text-brand-gold" aria-hidden="true" />
                    <span className="font-semibold text-brand-navy">{label}</span>
                  </a>
                ))}
              </div>

              <section id="vision" className="scroll-mt-28">
                <SectionTitle title="Our Vision" />
                <PlainText text={data.vision} />
              </section>
              <section id="mission" className="scroll-mt-28">
                <SectionTitle title="Our Mission" />
                <PlainText text={data.mission} />
              </section>

              {data.principal.message && (
                <section
                  id="principal"
                  className="grid scroll-mt-28 items-start gap-6 rounded-xl bg-surface p-6 md:grid-cols-[180px_1fr]"
                >
                  <CmsImage
                    imageId={data.principal.imageId}
                    alt={data.principal.name || 'Principal'}
                    className="aspect-square w-full rounded-lg"
                  />
                  <div>
                    <h2 className="text-2xl font-bold text-brand-navy">
                      Principal&rsquo;s Message
                    </h2>
                    <PlainText text={data.principal.message} className="mt-3" />
                    {data.principal.name && (
                      <p className="mt-4 font-semibold text-brand-navy">
                        {data.principal.name}
                        {data.principal.designation && (
                          <span className="block text-sm font-normal text-ink-muted">
                            {data.principal.designation}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {data.coreValues.length > 0 && (
                <section id="values" className="scroll-mt-28">
                  <SectionTitle title="Our Core Values" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    {data.coreValues.map((v) => (
                      <div
                        key={v.title}
                        className="rounded-lg border-l-4 border-brand-gold bg-white p-4 shadow-sm"
                      >
                        <h3 className="font-semibold text-brand-navy">{v.title}</h3>
                        {v.description && (
                          <p className="mt-1 text-sm text-ink-muted">{v.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </Container>
        )}
      </PageState>
    </>
  );
}

// --- Academics --------------------------------------------------------------------------

export function AcademicsPage() {
  usePageTitle('Academics');
  const { data, isLoading, isError } = usePublicPage('academics');
  const classes = usePublicClasses();
  const nav = [
    { id: 'overview', label: 'Academic Overview' },
    { id: 'classes', label: 'Classes Offered' },
    { id: 'curriculum', label: 'RBSE Curriculum' },
    ...(data?.subjects.length ? [{ id: 'subjects', label: 'Subjects' }] : []),
    ...(data?.calendar.length ? [{ id: 'calendar', label: 'Academic Calendar' }] : []),
  ];
  const first = classes.data?.[0]?.name;
  const last = classes.data?.[classes.data.length - 1]?.name;
  return (
    <>
      <PageBanner title="Academics" />
      <PageState isLoading={isLoading} isError={isError}>
        {data && (
          <Container className="grid gap-8 py-12 lg:grid-cols-[240px_1fr]">
            <aside>
              <SideNav items={nav} />
            </aside>
            <div className="space-y-12">
              <section
                id="overview"
                className="grid scroll-mt-28 items-start gap-6 md:grid-cols-[1fr_260px]"
              >
                <div>
                  <h2 className="text-2xl font-bold text-brand-navy">Academic Overview</h2>
                  <PlainText text={data.overview.text} className="mt-4" />
                </div>
                <CmsImage
                  imageId={data.overview.imageId}
                  alt="Learning at our school"
                  className="aspect-[4/3] w-full rounded-lg shadow"
                />
              </section>

              <section id="classes" className="scroll-mt-28">
                <SectionTitle title="Classes Offered" />
                {first && last && (
                  <div className="mb-4 flex items-center justify-center gap-3 rounded-lg bg-brand-navy/5 py-5 text-xl font-semibold text-brand-navy">
                    <GraduationCap className="h-7 w-7 text-brand-gold" aria-hidden="true" />
                    {first} – {last.replace('Class ', '')}
                    {last.startsWith('Class') ? 'th' : ''}
                  </div>
                )}
                {data.classesOffered && <PlainText text={data.classesOffered} />}
                {classes.data && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {classes.data.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-full bg-brand-gold-light px-3 py-1 text-sm text-brand-navy"
                      >
                        {c.name}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {data.curriculum && (
                <section id="curriculum" className="scroll-mt-28">
                  <SectionTitle title="RBSE Curriculum" />
                  <PlainText text={data.curriculum} />
                </section>
              )}

              {data.subjects.length > 0 && (
                <section id="subjects" className="scroll-mt-28">
                  <SectionTitle title="Subjects" />
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-100">
                        {data.subjects.map((s) => (
                          <tr key={s.stage} className="align-top">
                            <th
                              scope="row"
                              className="w-1/3 bg-surface px-4 py-3 text-left font-semibold text-brand-navy"
                            >
                              {s.stage}
                            </th>
                            <td className="px-4 py-3 text-ink-muted">{s.subjects}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {data.calendar.length > 0 && (
                <section id="calendar" className="scroll-mt-28">
                  <SectionTitle title="Academic Calendar" />
                  <ol className="relative space-y-4 border-l-2 border-brand-gold/40 pl-6">
                    {data.calendar.map((c, i) => (
                      <li key={i}>
                        <span
                          className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-brand-gold"
                          aria-hidden="true"
                        />
                        <p className="text-sm font-semibold text-brand-navy">{c.period}</p>
                        <p className="text-sm text-ink-muted">{c.event}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          </Container>
        )}
      </PageState>
    </>
  );
}

// --- Facilities -------------------------------------------------------------------------

export function FacilitiesPage() {
  usePageTitle('Facilities');
  const { data, isLoading, isError } = usePublicPage('facilities');
  return (
    <>
      <PageBanner title="Facilities" />
      <PageState isLoading={isLoading} isError={isError}>
        {data && (
          <Container className="py-12">
            <SectionTitle title="Our Facilities" subtitle={data.intro || undefined} />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((f) => (
                <article
                  key={f.title}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  <CmsImage imageId={f.imageId} alt={f.title} className="aspect-[16/10] w-full" />
                  <div className="p-5">
                    <h3 className="flex items-center gap-2 font-semibold text-brand-navy">
                      <SiteIconView icon={f.icon} className="h-5 w-5 text-brand-gold" />
                      {f.title}
                    </h3>
                    {f.description && (
                      <p className="mt-2 text-sm text-ink-muted">{f.description}</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </Container>
        )}
      </PageState>
    </>
  );
}
