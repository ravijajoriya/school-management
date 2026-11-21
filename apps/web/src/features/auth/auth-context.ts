import type { AuthUser, ChangePasswordInput, LoginInput, PermissionCode } from '@school/shared';
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

/** Where a user lands after signing in: admin-capable users → /admin, everyone else → /teacher. */
export function homePathFor(user: AuthUser): string {
  return user.roles.includes('ADMIN') || user.permissions.length > 0 ? '/admin' : '/teacher';
}
