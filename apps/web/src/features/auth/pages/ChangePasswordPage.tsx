import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema } from '@school/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { z } from 'zod';
import { Alert, Button, Field, Input, PageSpinner } from '@/components/ui';
import { splitFieldErrors } from '@/lib/api-client';
import { homePathFor, useAuth } from '../auth-context';

const formSchema = changePasswordSchema
  .and(z.object({ confirmPassword: z.string() }))
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type FormValues = z.infer<typeof formSchema>;

/** Used for the forced first-login change and for voluntary changes from the user menu. */
export function ChangePasswordPage() {
  const { user, status, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  if (status === 'loading') return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setServerError(null);
    try {
      const updated = await changePassword({ currentPassword, newPassword });
      navigate(homePathFor(updated), { replace: true });
    } catch (error) {
      const { fields, general } = splitFieldErrors(error);
      Object.entries(fields).forEach(([name, message]) =>
        setError(name as keyof FormValues, { message }),
      );
      if (general.length) setServerError(general[0]);
    }
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy">Change password</h1>
      {user.mustChangePassword ? (
        <p className="mt-2 text-sm text-ink-muted">
          Welcome, {user.fullName}. For security, choose a new password before continuing.
        </p>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          Other devices signed in to your account will be signed out.
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {serverError && <Alert>{serverError}</Alert>}
        <Field
          label="Current password"
          htmlFor="currentPassword"
          error={errors.currentPassword?.message}
        >
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            invalid={!!errors.currentPassword}
            {...register('currentPassword')}
          />
        </Field>
        <Field
          label="New password"
          htmlFor="newPassword"
          error={errors.newPassword?.message}
          hint="At least 8 characters, including a letter and a number."
        >
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            invalid={!!errors.newPassword}
            {...register('newPassword')}
          />
        </Field>
        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            invalid={!!errors.confirmPassword}
            {...register('confirmPassword')}
          />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
        {user.mustChangePassword ? (
          <Button variant="ghost" className="w-full" onClick={() => logout()}>
            Sign out
          </Button>
        ) : (
          <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        )}
      </form>
    </div>
  );
}
