import { EXAM_TYPE_LABELS, type ResultStatus } from '@school/shared';
import { ArrowLeft, Printer } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageSpinner,
  Select,
} from '@/components/ui';
import { errorMessages } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useExamProgress, useReportCard, useSectionResults } from '../exams-api';
import { ExportButtons } from '@/features/reports/components/ExportButtons';

const RESULT_TONE: Record<ResultStatus, 'green' | 'red' | 'amber'> = {
  PASS: 'green',
  FAIL: 'red',
  INCOMPLETE: 'amber',
};
const RESULT_LABEL: Record<ResultStatus, string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  INCOMPLETE: 'Incomplete',
};

export function SectionResultsPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const sectionId = params.get('sectionId') ?? '';
  const progress = useExamProgress(id);
  const sections = [
    ...new Map((progress.data ?? []).map((r) => [r.sectionId, r.sectionLabel])).entries(),
  ];
  const results = useSectionResults(id, sectionId);
  const r = results.data;
  return (
    <div>
      <Link
        to={`/admin/exams/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline print:hidden"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to exam
      </Link>
      <PageHeader
        title={
          r
            ? `Results · ${r.exam.name} · ${r.section.className} – ${r.section.sectionName}`
            : 'Results'
        }
        description={
          r
            ? `${r.section.academicYear} · ${r.gradingScale ? `grading: ${r.gradingScale.name}` : 'no grading scale yet'} · ${r.exam.final ? 'final results' : 'provisional — marks may still change'}`
            : undefined
        }
        actions={
          <div className="flex gap-2 print:hidden">
            <Select
              value={sectionId}
              onChange={(e) => setParams({ sectionId: e.target.value })}
              aria-label="Section"
              className="max-w-[200px]"
            >
              <option value="">Select section</option>
              {sections.map(([sid, label]) => (
                <option key={sid} value={sid}>
                  {label}
                </option>
              ))}
            </Select>
            {sectionId && (
              <ExportButtons report="exam-results" params={{ examinationId: id, sectionId }} />
            )}
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden="true" /> Print
            </Button>
          </div>
        }
      />
      {!sectionId ? (
        <EmptyState title="Choose a section" />
      ) : results.isLoading ? (
        <PageSpinner />
      ) : results.isError || !r ? (
        <Alert>{errorMessages(results.error)[0]}</Alert>
      ) : (
        <div className="space-y-6">
          {!r.exam.final && (
            <Alert tone="warning">These results are provisional until the exam is finalised.</Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Students', String(r.overall.students)],
              ['Passed', String(r.overall.passed)],
              ['Failed', String(r.overall.failed)],
              ['Pass %', r.overall.passPercent === null ? '—' : `${r.overall.passPercent}%`],
              ['Class average', r.overall.average === null ? '—' : `${r.overall.average}%`],
            ].map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
                <p className="mt-1 text-xl font-bold text-brand-navy">{value}</p>
              </Card>
            ))}
          </div>

          <Card className="overflow-x-auto">
            <h2 className="border-b border-gray-200 p-4 font-semibold text-brand-navy">
              Mark sheet
            </h2>
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Roll</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  {r.subjects.map((s) => (
                    <th key={s.classSubjectId} className="px-3 py-2 text-right font-medium">
                      {s.subjectName}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                  <th className="px-3 py-2 font-medium">Grade</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Rank</th>
                  <th className="print:hidden" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {r.students.map((s) => (
                  <tr key={s.enrolmentId} aria-label={s.fullName}>
                    <td className="px-3 py-2 text-ink-muted">{s.rollNumber ?? ''}</td>
                    <td className="px-3 py-2 font-medium text-ink">{s.fullName}</td>
                    {r.subjects.map((sub) => {
                      const x = s.subjects.find((y) => y.classSubjectId === sub.classSubjectId);
                      return (
                        <td
                          key={sub.classSubjectId}
                          className={`px-3 py-2 text-right ${x && !x.passed && !x.missing ? 'font-semibold text-red-700' : ''}`}
                        >
                          {!x ? (
                            <span className="text-ink-muted">—</span>
                          ) : x.missing ? (
                            <span className="text-amber-700">?</span>
                          ) : (
                            `${x.obtained}`
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      {s.obtained}/{s.max}
                    </td>
                    <td className="px-3 py-2 text-right">{s.percentage}</td>
                    <td className="px-3 py-2 font-semibold">{s.grade ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge tone={RESULT_TONE[s.result]}>{RESULT_LABEL[s.result]}</Badge>
                    </td>
                    <td className="px-3 py-2">{s.rank ?? '—'}</td>
                    <td className="px-3 py-2 text-right print:hidden">
                      <Link
                        to={`/admin/exams/${id}/report-cards/${s.enrolmentId}`}
                        className="text-sm text-brand-navy hover:underline"
                      >
                        Report card
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto">
            <h2 className="border-b border-gray-200 p-4 font-semibold text-brand-navy">
              Subject performance
            </h2>
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Subject</th>
                  <th className="px-4 py-2 text-right font-medium">Appeared</th>
                  <th className="px-4 py-2 text-right font-medium">Pass %</th>
                  <th className="px-4 py-2 text-right font-medium">Average %</th>
                  <th className="px-4 py-2 text-right font-medium">Highest</th>
                  <th className="px-4 py-2 text-right font-medium">Lowest</th>
                  <th className="px-4 py-2 font-medium">Grades</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {r.subjects.map((s) => (
                  <tr key={s.classSubjectId}>
                    <td className="px-4 py-2 font-medium">{s.subjectName}</td>
                    <td className="px-4 py-2 text-right">{s.appeared}</td>
                    <td className="px-4 py-2 text-right">{s.passPercent ?? '—'}</td>
                    <td className="px-4 py-2 text-right">{s.average ?? '—'}</td>
                    <td className="px-4 py-2 text-right">{s.highest ?? '—'}</td>
                    <td className="px-4 py-2 text-right">{s.lowest ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-ink-muted">
                      {Object.entries(s.gradeDistribution)
                        .map(([g, n]) => `${g}: ${n}`)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

export function ReportCardPage() {
  const { id = '', enrolmentId = '' } = useParams();
  const card = useReportCard(id, enrolmentId);
  if (card.isLoading) return <PageSpinner />;
  if (card.isError || !card.data) return <Alert>{errorMessages(card.error)[0]}</Alert>;
  const c = card.data;
  const r = c.result;
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Print report card
        </Button>
      </div>
      <Card className="p-8 print:border-0 print:shadow-none">
        <div className="border-b border-gray-300 pb-4 text-center">
          <h1 className="text-xl font-bold text-brand-navy">{c.school.name}</h1>
          <p className="text-xs text-ink-muted">{c.school.address}</p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide">
            Report card · {c.exam.name} ({EXAM_TYPE_LABELS[c.exam.examType]}) ·{' '}
            {c.enrolment.academicYear}
          </p>
          {!c.exam.final && (
            <p className="mt-1 text-xs font-semibold text-amber-700">
              Provisional — results not yet finalised
            </p>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-ink-muted">Student</dt>
          <dd className="text-right font-medium">{c.student.name}</dd>
          <dt className="text-ink-muted">Admission no.</dt>
          <dd className="text-right">{c.student.admissionNumber}</dd>
          <dt className="text-ink-muted">Class</dt>
          <dd className="text-right">
            {c.enrolment.className} – {c.enrolment.sectionName}
            {c.enrolment.rollNumber ? ` · Roll ${c.enrolment.rollNumber}` : ''}
          </dd>
          <dt className="text-ink-muted">Date of birth</dt>
          <dd className="text-right">{formatDate(c.student.dateOfBirth)}</dd>
          {c.student.guardianName && (
            <>
              <dt className="text-ink-muted">Parent / guardian</dt>
              <dd className="text-right">{c.student.guardianName}</dd>
            </>
          )}
        </dl>
        <table className="mt-5 w-full text-sm">
          <thead className="border-y border-gray-300 text-left text-xs uppercase text-ink-muted">
            <tr>
              <th className="py-2 font-medium">Subject</th>
              <th className="py-2 font-medium">Marks</th>
              <th className="py-2 text-right font-medium">Total</th>
              <th className="py-2 text-right font-medium">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {r.subjects.map((s) => (
              <tr key={s.classSubjectId}>
                <td className="py-2 font-medium">
                  {s.subjectName}
                  {s.optional && <span className="text-xs text-ink-muted"> (optional)</span>}
                </td>
                <td className="py-2 text-ink-muted">
                  {s.components.map((comp, i) => (
                    <span key={i} className={!comp.passed ? 'text-red-700' : ''}>
                      {i > 0 && ' + '}
                      {comp.name ? `${comp.name} ` : ''}
                      {comp.absent ? 'AB' : (comp.obtained ?? '—')}/{comp.max}
                    </span>
                  ))}
                </td>
                <td className={`py-2 text-right ${!s.passed ? 'font-semibold text-red-700' : ''}`}>
                  {s.obtained}/{s.max}
                </td>
                <td className="py-2 text-right font-semibold">{s.grade ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-300">
            <tr>
              <td className="py-2 font-semibold">Total</td>
              <td />
              <td className="py-2 text-right font-bold">
                {r.obtained}/{r.max}
              </td>
              <td className="py-2 text-right font-bold">{r.grade ?? '—'}</td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-ink-muted">Percentage</p>
            <p className="font-semibold">{r.percentage}%</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Result</p>
            <p className="font-semibold">
              {RESULT_LABEL[r.result]}
              {r.division ? ` · ${r.division}` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Rank in section</p>
            <p className="font-semibold">{r.rank ? `${r.rank} of ${c.sectionSize}` : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Attendance</p>
            <p className="font-semibold">
              {c.attendance
                ? `${c.attendance.present}/${c.attendance.marked} (${c.attendance.percentage}%)`
                : '—'}
            </p>
          </div>
        </div>
        <div className="mt-12 grid grid-cols-3 gap-6 text-center text-xs text-ink-muted">
          <span className="border-t border-gray-400 pt-1">
            Class teacher{c.classTeacher ? `: ${c.classTeacher}` : ''}
          </span>
          <span className="border-t border-gray-400 pt-1">Principal</span>
          <span className="border-t border-gray-400 pt-1">Parent / guardian</span>
        </div>
      </Card>
    </div>
  );
}
