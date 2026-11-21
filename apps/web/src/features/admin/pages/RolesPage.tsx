import { zodResolver } from '@hookform/resolvers/zod';
import {
  PERMISSIONS,
  createRoleSchema,
  type CreateRoleInput,
  type PermissionItem,
  type RoleItem,
} from '@school/shared';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Modal,
  PageHeader,
  PageSpinner,
} from '@/components/ui';
import { PermissionGate } from '@/features/auth/RequireAuth';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import {
  useCreateRole,
  useDeleteRole,
  usePermissions,
  useRoles,
  useSetRolePermissions,
} from '../api';

const MODULE_LABELS: Record<string, string> = {
  users: 'Users',
  access_control: 'Roles & permissions',
  audit: 'Audit logs',
};

export function RolesPage() {
  const roles = useRoles();
  const permissions = usePermissions();
  const [chosenId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Default to the first role until the user picks one (or after the chosen one is deleted).
  const selectedId = roles.data?.find((r) => r.id === chosenId)?.id ?? roles.data?.[0]?.id ?? null;

  if (roles.isLoading || permissions.isLoading) return <PageSpinner />;
  if (roles.isError || permissions.isError) {
    return <Alert>{errorMessages(roles.error ?? permissions.error)[0]}</Alert>;
  }

  const selected = roles.data?.find((r) => r.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Roles group permissions. Users get the combined permissions of all their roles."
        actions={
          <PermissionGate permissions={[PERMISSIONS.ROLES_MANAGE]}>
            <Button onClick={() => setCreating(true)}>New role</Button>
          </PermissionGate>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <ul className="divide-y divide-gray-100">
            {roles.data?.map((role) => (
              <li key={role.id}>
                <button
                  onClick={() => setSelectedId(role.id)}
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    role.id === selectedId ? 'bg-brand-gold-light' : 'hover:bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{role.name}</span>
                    <span className="text-xs text-ink-muted">{role.userCount} users</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <Badge tone="gray">{role.code}</Badge>
                    {role.isSystem && <Badge tone="navy">System</Badge>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {selected && (
          <RoleEditor
            key={selected.id + selected.permissionCodes.join(',')}
            role={selected}
            permissions={permissions.data ?? []}
            onDeleted={() => setSelectedId(null)}
          />
        )}
      </div>

      {creating && (
        <CreateRoleModal
          open
          onClose={() => setCreating(false)}
          onCreated={(role) => {
            setCreating(false);
            setSelectedId(role.id);
          }}
        />
      )}
    </div>
  );
}

function RoleEditor({
  role,
  permissions,
  onDeleted,
}: {
  role: RoleItem;
  permissions: PermissionItem[];
  onDeleted: () => void;
}) {
  const { can } = useAuth();
  const savePermissions = useSetRolePermissions();
  const deleteRole = useDeleteRole();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role.permissionCodes));
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const editable = can(PERMISSIONS.ROLES_MANAGE) && !role.permissionsLocked;
  const dirty =
    selected.size !== role.permissionCodes.length ||
    role.permissionCodes.some((c) => !selected.has(c));

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const p of permissions) map.set(p.module, [...(map.get(p.module) ?? []), p]);
    return [...map.entries()];
  }, [permissions]);

  const toggle = (code: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });

  const onSave = async () => {
    setMessage(null);
    try {
      await savePermissions.mutateAsync({ id: role.id, permissionCodes: [...selected] });
      setMessage({
        tone: 'success',
        text: 'Permissions saved. Changes apply to users immediately.',
      });
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessages(error)[0] });
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete the role "${role.name}"?`)) return;
    try {
      await deleteRole.mutateAsync(role.id);
      onDeleted();
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessages(error)[0] });
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 p-5">
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">{role.name}</h2>
          {role.description && <p className="mt-1 text-sm text-ink-muted">{role.description}</p>}
        </div>
        {can(PERMISSIONS.ROLES_MANAGE) && !role.isSystem && (
          <Button variant="secondary" size="sm" onClick={onDelete} loading={deleteRole.isPending}>
            Delete role
          </Button>
        )}
      </div>
      <div className="space-y-6 p-5">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {role.permissionsLocked && (
          <Alert tone="info">
            The Administrator role always has every permission and cannot be changed.
          </Alert>
        )}
        {grouped.map(([module, items]) => (
          <fieldset key={module}>
            <legend className="mb-2 text-sm font-semibold text-ink">
              {MODULE_LABELS[module] ?? module}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((p) => (
                <Checkbox
                  key={p.code}
                  label={p.name}
                  description={p.code}
                  checked={role.permissionsLocked || selected.has(p.code)}
                  disabled={!editable}
                  onChange={(e) => toggle(p.code, e.target.checked)}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {editable && (
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <Button
            variant="secondary"
            disabled={!dirty}
            onClick={() => setSelected(new Set(role.permissionCodes))}
          >
            Discard
          </Button>
          <Button disabled={!dirty} loading={savePermissions.isPending} onClick={onSave}>
            Save permissions
          </Button>
        </div>
      )}
    </Card>
  );
}

function CreateRoleModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (role: RoleItem) => void;
}) {
  const createRole = useCreateRole();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<CreateRoleInput>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: { code: '', name: '', description: '' },
  });
  const { errors } = formState;

  const onSubmit = handleSubmit(async (values) => {
    try {
      onCreated(await createRole.mutateAsync(values));
    } catch (error) {
      const { fields, general } = splitFieldErrors(error);
      Object.entries(fields).forEach(([k, message]) =>
        setError(k as keyof CreateRoleInput, { message }),
      );
      if (general.length) setServerError(general[0]);
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New role"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={formState.isSubmitting}>
            Create role
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <Alert>{serverError}</Alert>}
        <Field label="Name" htmlFor="name" error={errors.name?.message} required>
          <Input
            id="name"
            placeholder="e.g. Accountant"
            invalid={!!errors.name}
            {...register('name')}
          />
        </Field>
        <Field
          label="Code"
          htmlFor="code"
          error={errors.code?.message}
          hint="Capital letters, digits and underscores, e.g. ACCOUNTANT"
          required
        >
          <Input id="code" placeholder="ACCOUNTANT" invalid={!!errors.code} {...register('code')} />
        </Field>
        <Field label="Description" htmlFor="description" error={errors.description?.message}>
          <Input id="description" {...register('description')} />
        </Field>
        <p className="text-xs text-ink-muted">After creating the role, choose its permissions.</p>
      </form>
    </Modal>
  );
}
