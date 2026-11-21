import type { AuditLogItem } from '@school/shared';
import { Fragment, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  PageSpinner,
  Pagination,
} from '@/components/ui';
import { errorMessages } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useAuditLogs } from '../api';

const ACTION_LABELS: Record<string, string> = {
  'auth.login_succeeded': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.logout': 'Signed out',
  'auth.refresh_token_reused': 'Suspicious session reuse',
  'auth.password_changed': 'Changed password',
  'user.created': 'User created',
  'user.updated': 'User updated',
  'user.roles_changed': 'User roles changed',
  'user.password_reset': 'Password reset by admin',
  'role.created': 'Role created',
  'role.updated': 'Role updated',
  'role.deleted': 'Role deleted',
  'role.permissions_changed': 'Role permissions changed',
};

const actionTone = (action: string) =>
  action === 'auth.login_failed' || action === 'auth.refresh_token_reused'
    ? 'red'
    : action.startsWith('auth.')
      ? 'gray'
      : 'navy';

export function AuditLogsPage() {
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const debouncedAction = useDebouncedValue(action);

  const logs = useAuditLogs({ action: debouncedAction, from, to, page, pageSize: 25 });

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="A permanent record of sign-ins and administrative changes. Entries cannot be edited or deleted."
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 p-4">
          <label className="text-xs text-ink-muted">
            Action
            <Input
              placeholder="e.g. login, user, role"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-56"
            />
          </label>
          <label className="text-xs text-ink-muted">
            From
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="mt-1"
            />
          </label>
          <label className="text-xs text-ink-muted">
            To
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="mt-1"
            />
          </label>
          {(action || from || to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAction('');
                setFrom('');
                setTo('');
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {logs.isLoading ? (
          <PageSpinner />
        ) : logs.isError ? (
          <div className="p-4">
            <Alert>{errorMessages(logs.error)[0]}</Alert>
          </div>
        ) : !logs.data?.items.length ? (
          <EmptyState title="No audit entries" description="Nothing matches these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Who</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Record</th>
                  <th className="px-4 py-3 font-medium">IP address</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.data.items.map((log) => (
                  <Fragment key={log.id}>
                    <tr className="hover:bg-surface/60">
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {log.user?.fullName ?? <span className="text-ink-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={actionTone(log.action)}>
                          {ACTION_LABELS[log.action] ?? log.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{log.entityType}</td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                        {log.ipAddress ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(log.beforeJson != null || log.afterJson != null) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                          >
                            {expanded === log.id ? 'Hide' : 'Details'}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {expanded === log.id && <DetailsRow log={log} />}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {logs.data && logs.data.total > 0 && (
          <Pagination
            page={logs.data.page}
            totalPages={logs.data.totalPages}
            total={logs.data.total}
            onChange={setPage}
          />
        )}
      </Card>
    </div>
  );
}

function DetailsRow({ log }: { log: AuditLogItem }) {
  const block = (label: string, value: unknown) =>
    value == null ? null : (
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs font-semibold uppercase text-ink-muted">{label}</div>
        <pre className="overflow-x-auto rounded bg-white p-3 text-xs text-ink">
          {JSON.stringify(value, null, 2)}
        </pre>
      </div>
    );
  return (
    <tr className="bg-surface">
      <td colSpan={6} className="px-4 py-3">
        <div className="flex flex-wrap gap-4">
          {block('Before', log.beforeJson)}
          {block('After', log.afterJson)}
        </div>
        {log.userAgent && (
          <p className="mt-2 truncate text-xs text-ink-muted">Device: {log.userAgent}</p>
        )}
      </td>
    </tr>
  );
}
