import {
  GENDER_LABELS,
  GUARDIAN_RELATIONSHIP_LABELS,
  type Gender,
  type GuardianRelationship,
} from '@school/shared';
import { ArrowLeft, Phone, Users } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Alert, Badge, Card, EmptyState, PageHeader, PageSpinner } from '@/components/ui';
import { errorMessages } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useMySections, useRoster } from '../teacher-api';

/** Cards for each section the teacher has access to; shared by the dashboard and My Classes. */
export function MySectionCards({ compact = false }: { compact?: boolean }) {
  const sections = useMySections();
  if (sections.isLoading) return <PageSpinner />;
  if (sections.isError) return <Alert>{errorMessages(sections.error)[0]}</Alert>;
  if (!sections.data?.length) {
    return (
      <EmptyState
        title="No classes assigned yet"
        description="The office assigns class teachers and subject teachers for the current academic year."
      />
    );
  }
  return (
    <div className={compact ? 'space-y-3' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
      {sections.data.map((s) => (
        <Link
          key={s.sectionId}
          to={`/teacher/classes/${s.sectionId}`}
          className="block rounded-lg border border-gray-200 bg-white p-4 transition hover:border-brand-gold hover:shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-brand-navy">
                {s.className} – {s.sectionName}
              </p>
              <p className="text-xs text-ink-muted">{s.academicYear.name}</p>
            </div>
            {s.isClassTeacher && <Badge tone="gold">Class teacher</Badge>}
          </div>
          <p className="mt-2 flex items-center gap-1 text-sm text-ink-muted">
            <Users className="h-4 w-4" aria-hidden="true" /> {s.studentCount} student
            {s.studentCount === 1 ? '' : 's'}
          </p>
          {s.subjects.length > 0 && (
            <p className="mt-1 text-sm text-ink">{s.subjects.join(', ')}</p>
          )}
        </Link>
      ))}
    </div>
  );
}

export function MyClassesPage() {
  return (
    <div>
      <PageHeader
        title="My classes"
        description="Sections you are class teacher of or teach a subject in this year."
      />
      <MySectionCards />
    </div>
  );
}

export function ClassRosterPage() {
  const { sectionId = '' } = useParams();
  const sections = useMySections();
  const roster = useRoster(sectionId);
  const section = sections.data?.find((s) => s.sectionId === sectionId);

  return (
    <div className="max-w-5xl">
      <Link
        to="/teacher/classes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My classes
      </Link>
      <PageHeader
        title={section ? `${section.className} – ${section.sectionName}` : 'Class list'}
        description={
          section
            ? [
                section.academicYear.name,
                section.isClassTeacher ? 'You are the class teacher' : null,
                section.subjects.join(', ') || null,
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
      />
      {roster.isLoading ? (
        <PageSpinner />
      ) : roster.isError ? (
        <Alert>{errorMessages(roster.error)[0]}</Alert>
      ) : !roster.data?.length ? (
        <EmptyState title="No students in this section yet" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Roll</th>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Gender</th>
                <th className="px-4 py-3 font-medium">Date of birth</th>
                <th className="px-4 py-3 font-medium">Parent / guardian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {roster.data.map((r) => (
                <tr key={r.enrolmentId}>
                  <td className="px-4 py-3 text-ink-muted">{r.rollNumber ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-ink">{r.fullName}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {r.gender ? GENDER_LABELS[r.gender as Gender] : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{formatDate(r.dateOfBirth)}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {r.guardian ? (
                      <>
                        {r.guardian.fullName} (
                        {GUARDIAN_RELATIONSHIP_LABELS[
                          r.guardian.relationship as GuardianRelationship
                        ] ?? r.guardian.relationship}
                        ) ·{' '}
                        <a
                          href={`tel:${r.guardian.phone}`}
                          className="inline-flex items-center gap-1 text-brand-navy hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                          {r.guardian.phone}
                        </a>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-gray-200 px-4 py-3 text-xs text-ink-muted">
            {roster.data.length} students
          </p>
        </Card>
      )}
    </div>
  );
}
