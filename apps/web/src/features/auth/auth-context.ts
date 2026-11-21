import {
  hasAdminAccess,
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
  type PermissionCode,
} from '@school/shared';
import { createContext, useContext } from 'react';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (input: LoginInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (input: ChangePasswordInput) => Promise<AuthUser>;
  can: (...permissions: PermissionCode[]) => boolean;
  hasRole: (role: string) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Where a user lands after signing in: ADMIN or any administrative permission → /admin; teachers
 * (no permissions, or only self-service ones such as marking their own class) → /teacher.
 */
export function homePathFor(user: AuthUser): string {
  return hasAdminAccess(user.roles, user.permissions) ? '/admin' : '/teacher';
}
