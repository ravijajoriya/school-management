import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@school/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { SchoolLogo } from '@/components/common/SchoolLogo';
import { Alert, Button, Field, Input, PageSpinner } from '@/components/ui';
import { SITE } from '@/config/site';
import { apiStatus, errorMessages } from '@/lib/api-client';
import { homePathFor, useAuth } from '../auth-context';

/** Staff login for Admin and Teacher users (email or phone + password). */
export function LoginPage() {
  const { login, status, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  if (status === 'loading') return <PageSpinner />;
  if (user)
    return (
      <Navigate
        to={user.mustChangePassword ? '/change-password' : (from ?? homePathFor(user))}
        replace
      />
    );

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const signedIn = await login(values);
      navigate(signedIn.mustChangePassword ? '/change-password' : (from ?? homePathFor(signedIn)), {
        replace: true,
      });
    } catch (error) {
      setServerError(
        apiStatus(error) === 429
          ? 'Too many login attempts. Please wait a minute and try again.'
          : errorMessages(error)[0],
      );
    }
  });

  return (
    <div>
      <div className="text-center">
        <SchoolLogo className="mx-auto h-14 w-14" />
        <h1 className="mt-4 text-2xl font-bold text-brand-navy">Staff Login</h1>
        <p className="mt-1 text-sm text-ink-muted">{SITE.name}</p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        {serverError && <Alert>{serverError}</Alert>}
        <Field
          label="Email or phone number"
          htmlFor="identifier"
          error={errors.identifier?.message}
        >
          <Input
            id="identifier"
            autoComplete="username"
            autoFocus
            invalid={!!errors.identifier}
            {...register('identifier')}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            invalid={!!errors.password}
            {...register('password')}
          />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
        <p className="text-center text-xs text-ink-muted">
          Forgot your password? Ask the school administrator to reset it.
        </p>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link to="/" className="text-brand-navy hover:underline">
          ← Back to website
        </Link>
      </p>
    </div>
  );
}
