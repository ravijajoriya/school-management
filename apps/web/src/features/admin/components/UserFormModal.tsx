import { zodResolver } from '@hookform/resolvers/zod';
import {
  PERMISSIONS,
  USER_STATUSES,
  createUserSchema,
  updateUserSchema,
  type UserListItem,
} from '@school/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Field, Input, Modal, Select } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { splitFieldErrors } from '@/lib/api-client';
import { USER_STATUS_LABEL } from '@/lib/format';
import { useCreateUser, useResetPassword, useRoles, useSetUserRoles, useUpdateUser } from '../api';
import { RoleCheckboxes } from './RoleCheckboxes';

const editSchema = updateUserSchema.extend({
  fullName: z.string().trim().min(2, 'Enter the full name').max(160),
  roleIds: z.array(z.string()).min(1, 'Select at least one role'),
});

type CreateValues = z.input<typeof createUserSchema>;
type EditValues = z.input<typeof editSchema>;

export interface UserFormResult {
  userName: string;
  temporaryPassword?: string;
}

/** Create a user (no `user` prop) or edit an existing one. Mount only while open so each
 *  opening starts with a fresh form. */
export function UserFormModal({
  open,
  onClose,
  user,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  user?: UserListItem | null;
  onDone: (result: UserFormResult) => void;
}) {
  return user ? (
    <EditUserModal open={open} onClose={onClose} user={user} onDone={onDone} />
  ) : (
    <CreateUserModal open={open} onClose={onClose} onDone={onDone} />
  );
}

function CreateUserModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (r: UserFormResult) => void;
}) {
  const roles = useRoles(open);
  const createUser = useCreateUser();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<CreateValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { fullName: '', email: '', phone: '', roleIds: [] },
  });
  const { register, handleSubmit, control, setError, formState } = form;
  const { errors } = formState;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await createUser.mutateAsync(values);
      onDone({ userName: res.user.fullName, temporaryPassword: res.temporaryPassword });
    } catch (error) {
      const { fields, general } = splitFieldErrors(error);
      Object.entries(fields).forEach(([k, message]) =>
        setError(k as keyof CreateValues, { message }),
      );
      if (general.length) setServerError(general[0]);
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add user"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={formState.isSubmitting}>
            Create user
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <Alert>{serverError}</Alert>}
        <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
          <Input id="fullName" invalid={!!errors.fullName} {...register('fullName')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" invalid={!!errors.email} {...register('email')} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" type="tel" invalid={!!errors.phone} {...register('phone')} />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-ink-muted">
          Email or phone is required — either can be used to sign in.
        </p>
        <Field label="Roles" error={errors.roleIds?.message} required>
          {roles.isLoading ? (
            <p className="text-sm text-ink-muted">Loading roles…</p>
          ) : (
            <Controller
              control={control}
              name="roleIds"
              render={({ field }) => (
                <RoleCheckboxes
                  roles={roles.data ?? []}
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              )}
            />
          )}
        </Field>
        <Alert tone="info">
          A temporary password will be generated and shown once after the user is created.
        </Alert>
      </form>
    </Modal>
  );
}

function EditUserModal({
  open,
  onClose,
  user,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  user: UserListItem;
  onDone: (r: UserFormResult) => void;
}) {
  const { can, user: me } = useAuth();
  const roles = useRoles(open && can(PERMISSIONS.ROLES_READ));
  const updateUser = useUpdateUser();
  const setRoles = useSetUserRoles();
  const resetPassword = useResetPassword();
  const [serverError, setServerError] = useState<string | null>(null);
  const isSelf = me?.id === user.id;

  const { register, handleSubmit, control, setError, formState } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      fullName: user.fullName,
      email: user.email ?? '',
      phone: user.phone ?? '',
      status: user.status,
      roleIds: user.roles.map((r) => r.id),
    },
  });
  const { errors, dirtyFields } = formState;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const { roleIds, ...profile } = values;
      if (dirtyFields.fullName || dirtyFields.email || dirtyFields.phone || dirtyFields.status) {
        await updateUser.mutateAsync({ id: user.id, ...profile });
      }
      if (dirtyFields.roleIds) {
        await setRoles.mutateAsync({ id: user.id, roleIds: roleIds as string[] });
      }
      onDone({ userName: values.fullName });
    } catch (error) {
      const { fields, general } = splitFieldErrors(error);
      Object.entries(fields).forEach(([k, message]) =>
        setError(k as keyof EditValues, { message }),
      );
      if (general.length) setServerError(general[0]);
    }
  });

  const onReset = async () => {
    if (
      !window.confirm(
        `Reset the password for ${user.fullName}? They will be signed out everywhere.`,
      )
    )
      return;
    setServerError(null);
    try {
      const res = await resetPassword.mutateAsync(user.id);
      onDone({ userName: user.fullName, temporaryPassword: res.temporaryPassword });
    } catch (error) {
      setServerError(splitFieldErrors(error).general[0] ?? 'Could not reset the password');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${user.fullName}`}
      size="lg"
      footer={
        <>
          {can(PERMISSIONS.USERS_UPDATE) && !isSelf && (
            <Button
              variant="secondary"
              className="mr-auto"
              onClick={onReset}
              loading={resetPassword.isPending}
            >
              Reset password
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={formState.isSubmitting}>
            Save changes
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <Alert>{serverError}</Alert>}
        <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
          <Input id="fullName" invalid={!!errors.fullName} {...register('fullName')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" invalid={!!errors.email} {...register('email')} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" type="tel" invalid={!!errors.phone} {...register('phone')} />
          </Field>
        </div>
        <Field
          label="Status"
          htmlFor="status"
          error={errors.status?.message}
          hint={
            isSelf
              ? 'You cannot change your own status.'
              : 'Inactive and locked users cannot sign in.'
          }
        >
          <Select
            id="status"
            disabled={isSelf || !can(PERMISSIONS.USERS_DEACTIVATE)}
            {...register('status')}
          >
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {USER_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        {can(PERMISSIONS.ROLES_READ) && (
          <Field label="Roles" error={errors.roleIds?.message} required>
            {roles.isLoading ? (
              <p className="text-sm text-ink-muted">Loading roles…</p>
            ) : (
              <Controller
                control={control}
                name="roleIds"
                render={({ field }) => (
                  <RoleCheckboxes
                    roles={roles.data ?? []}
                    value={field.value ?? []}
                    onChange={field.onChange}
                  />
                )}
              />
            )}
          </Field>
        )}
      </form>
    </Modal>
  );
}
