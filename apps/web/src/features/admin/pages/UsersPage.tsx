import { PERMISSIONS, USER_STATUSES, type UserListItem, type UserStatus } from '@school/shared';
import { useState } from 'react';
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
  Select,
} from '@/components/ui';
import { PermissionGate } from '@/features/auth/RequireAuth';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages } from '@/lib/api-client';
import { USER_STATUS_LABEL, USER_STATUS_TONE, formatDateTime } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useRoles, useUsers } from '../api';
import { TemporaryPasswordModal } from '../components/TemporaryPasswordModal';
import { UserFormModal, type UserFormResult } from '../components/UserFormModal';

export function UsersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [roleId, setRoleId] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const users = useUsers({
    search: debouncedSearch,
    status: status || undefined,
    roleId,
    page,
    pageSize: 20,
  });
  const roles = useRoles(can(PERMISSIONS.ROLES_READ));

  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);

  const handleDone = (result: UserFormResult) => {
    setEditing(null);
    setCreating(false);
    if (result.temporaryPassword) {
      setTempPassword({ name: result.userName, password: result.temporaryPassword });
    } else {
      setNotice(`Saved changes for ${result.userName}.`);
    }
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description="Staff accounts that can sign in to the Admin and Teacher portals."
        actions={
          <PermissionGate permissions={[PERMISSIONS.USERS_CREATE]}>
            <Button onClick={() => setCreating(true)}>Add user</Button>
          </PermissionGate>
        }
      />

      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-gray-200 p-4">
          <Input
            type="search"
            placeholder="Search name, email or phone"
            className="max-w-xs"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search users"
          />
          <Select
            className="max-w-[160px]"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as UserStatus | '');
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {USER_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          {roles.data && (
            <Select
              className="max-w-[200px]"
              value={roleId}
              onChange={(e) => {
                setRoleId(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {roles.data.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        {users.isLoading ? (
          <PageSpinner />
        ) : users.isError ? (
          <div className="p-4">
            <Alert>{errorMessages(users.error)[0]}</Alert>
          </div>
        ) : users.data && users.data.items.length === 0 ? (
          <EmptyState title="No users found" description="Try a different search or filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Roles</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last sign-in</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.data?.items.map((u) => (
                  <tr key={u.id} className="hover:bg-surface/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{u.fullName}</div>
                      {u.mustChangePassword && <Badge tone="amber">Password change pending</Badge>}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {u.email && <div>{u.email}</div>}
                      {u.phone && <div>{u.phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r.id} tone={r.code === 'ADMIN' ? 'navy' : 'gold'}>
                            {r.name}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={USER_STATUS_TONE[u.status]}>{USER_STATUS_LABEL[u.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{formatDateTime(u.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <PermissionGate permissions={[PERMISSIONS.USERS_UPDATE]}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setNotice(null);
                            setEditing(u);
                          }}
                        >
                          Edit
                        </Button>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {users.data && users.data.total > 0 && (
          <Pagination
            page={users.data.page}
            totalPages={users.data.totalPages}
            total={users.data.total}
            onChange={setPage}
          />
        )}
      </Card>

      {creating && <UserFormModal open onClose={() => setCreating(false)} onDone={handleDone} />}
      {editing && (
        <UserFormModal open onClose={() => setEditing(null)} user={editing} onDone={handleDone} />
      )}
      {tempPassword && (
        <TemporaryPasswordModal
          open
          onClose={() => setTempPassword(null)}
          userName={tempPassword.name}
          password={tempPassword.password}
        />
      )}
    </div>
  );
}
