import { PERMISSIONS, formatRupees } from '@school/shared';
import { Coins, CreditCard, ReceiptText } from 'lucide-react';
import { Link } from 'react-router';
import { SectionCard } from '@/components/common/SectionCard';
import { PageSpinner } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useStudentLedger } from '../fees-api';

const linkButton =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:gap-1.5 sm:px-3 sm:text-sm';

/** Fee summary on a student's page, linking to the full ledger and the collect screen. */
export function StudentFeeCard({ studentId }: { studentId: string }) {
  const { can } = useAuth();
  const ledger = useStudentLedger(studentId);
  const l = ledger.data;
  const owes = !!l && l.totals.balance > 0;
  return (
    <SectionCard
      icon={Coins}
      title="Fees"
      actions={
        <>
          <Link
            to={`/admin/fees/students/${studentId}`}
            className={`${linkButton} border border-gray-300 bg-white text-ink shadow-sm hover:bg-gray-50`}
          >
            <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" /> Fee ledger
          </Link>
          {can(PERMISSIONS.FEES_COLLECT) && owes && (
            <Link
              to={`/admin/fees/collect?studentId=${studentId}`}
              className={`${linkButton} bg-brand-navy text-white shadow-sm hover:bg-brand-navy-light`}
            >
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" /> Collect payment
            </Link>
          )}
        </>
      }
    >
      {ledger.isLoading ? (
        <PageSpinner />
      ) : !l?.enrolment ? (
        <p className="text-sm text-ink-muted">Not enrolled in a class.</p>
      ) : l.dues.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No fees billed for {l.enrolment.academicYear.name} yet.
        </p>
      ) : (
        <div
          className={`rounded-lg px-3 py-2.5 text-sm ${owes ? 'bg-red-50 ring-1 ring-red-100' : 'bg-green-50 ring-1 ring-green-100'}`}
        >
          <p className="text-ink">
            {l.enrolment.academicYear.name}: Billed{' '}
            {formatRupees(l.totals.billed + l.totals.fines - l.totals.reductions)}, Paid{' '}
            {formatRupees(l.totals.paid)}
          </p>
          <p className="mt-0.5">
            <strong className={owes ? 'text-red-700' : 'text-green-700'}>
              {owes ? `${formatRupees(l.totals.balance)} outstanding` : 'Fully paid'}
            </strong>
            {l.totals.overdue > 0 && (
              <span className="text-red-700"> ({formatRupees(l.totals.overdue)} overdue)</span>
            )}
          </p>
        </div>
      )}
    </SectionCard>
  );
}
