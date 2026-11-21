import { PERMISSIONS, formatRupees } from '@school/shared';
import { Link } from 'react-router';
import { Button, Card, PageSpinner } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useStudentLedger } from '../fees-api';

/** Fee summary on a student's page, linking to the full ledger and the collect screen. */
export function StudentFeeCard({ studentId }: { studentId: string }) {
  const { can } = useAuth();
  const ledger = useStudentLedger(studentId);
  const l = ledger.data;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-brand-navy">Fees</h2>
        <div className="flex gap-2">
          <Link
            to={`/admin/fees/students/${studentId}`}
            className="text-sm text-brand-navy hover:underline"
          >
            Fee ledger
          </Link>
          {can(PERMISSIONS.FEES_COLLECT) && l && l.totals.balance > 0 && (
            <Link to={`/admin/fees/collect?studentId=${studentId}`}>
              <Button size="sm">Collect payment</Button>
            </Link>
          )}
        </div>
      </div>
      {ledger.isLoading ? (
        <PageSpinner />
      ) : !l?.enrolment ? (
        <p className="mt-2 text-sm text-ink-muted">Not enrolled in a class.</p>
      ) : l.dues.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          No fees billed for {l.enrolment.academicYear.name} yet.
        </p>
      ) : (
        <p className="mt-2 text-sm">
          {l.enrolment.academicYear.name}: billed{' '}
          {formatRupees(l.totals.billed + l.totals.fines - l.totals.reductions)}, paid{' '}
          {formatRupees(l.totals.paid)} ·{' '}
          <strong className={l.totals.balance > 0 ? 'text-red-700' : 'text-green-700'}>
            {l.totals.balance > 0 ? `${formatRupees(l.totals.balance)} outstanding` : 'fully paid'}
          </strong>
          {l.totals.overdue > 0 && (
            <span className="text-red-700"> ({formatRupees(l.totals.overdue)} overdue)</span>
          )}
        </p>
      )}
    </Card>
  );
}
