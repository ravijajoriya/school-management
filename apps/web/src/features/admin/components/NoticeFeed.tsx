import { Megaphone } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useNoticeFeed } from '../cms-api';

/** Staff notices addressed to the signed-in user (dashboard widget). */
export function NoticeFeed() {
  const feed = useNoticeFeed();
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold text-brand-navy">
        <Megaphone className="h-5 w-5 text-brand-gold" aria-hidden="true" /> Notices
      </h2>
      {!feed.data?.length ? (
        <p className="mt-2 text-sm text-ink-muted">No notices right now.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {feed.data.map((n) => (
            <li key={n.id} className="py-3">
              <p className="font-medium text-ink">{n.title}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{n.body}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {formatDateTime(n.publishAt ?? n.createdAt)} · {n.createdBy.fullName}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
