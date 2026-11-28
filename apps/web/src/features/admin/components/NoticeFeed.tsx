import { ArrowRight, CalendarDays, Megaphone } from 'lucide-react';
import { Link } from 'react-router';
import { SectionCard } from '@/components/common/SectionCard';
import { formatDateTime } from '@/lib/format';
import { useNoticeFeed } from '../cms-api';

/** Staff notices addressed to the signed-in user (dashboard widget). */
export function NoticeFeed({ viewAllTo }: { viewAllTo?: string }) {
  const feed = useNoticeFeed();
  return (
    <SectionCard
      dense
      icon={Megaphone}
      title="Notices"
      actions={
        viewAllTo && (
          <Link
            to={viewAllTo}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-brand-navy sm:text-sm"
          >
            View All <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )
      }
    >
      {!feed.data?.length ? (
        <p className="text-sm text-ink-muted">No notices right now.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {feed.data.map((n) => (
            <li key={n.id} className="flex gap-2.5 py-2.5 first:pt-0 last:pb-0 sm:gap-3 sm:py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 sm:h-9 sm:w-9">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink sm:text-sm">{n.title}</p>
                <p className="mt-0.5 whitespace-pre-line text-xs text-ink-muted sm:text-sm">
                  {n.body}
                </p>
                <p className="mt-1 text-[11px] text-ink-muted sm:text-xs">
                  {formatDateTime(n.publishAt ?? n.createdAt)} · {n.createdBy.fullName}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
