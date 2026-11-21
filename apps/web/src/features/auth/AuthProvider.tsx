import { useQueryClient } from '@tanstack/react-query';
import type { AuthResponse, AuthUser, ChangePasswordInput, LoginInput } from '@school/shared';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient, refreshSession, session } from '@/lib/api-client';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const queryClient = useQueryClient();

  // Mirror the in-memory session (updated by login, refresh and the 401 interceptor),
  // and on first load restore the session from the refresh cookie, if there is one.
  useEffect(() => {
    let signedIn = false;
    const unsubscribe = session.subscribe((auth) => {
      setUser(auth?.user ?? null);
      setStatus(auth ? 'authenticated' : 'anonymous');
      // On sign-out, drop cached staff data. Public website data (['public', …]) is kept, and
      // nothing is touched for anonymous visitors (that would cancel in-flight public requests).
      if (!auth && signedIn) {
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'public' });
      }
      signedIn = !!auth;
    });
    refreshSession().catch(() => session.set(null));
    return unsubscribe;
  }, [queryClient]);

  const login = useCallback(async (input: LoginInput) => {
    const { data } = await apiClient.post<AuthResponse>('/auth/login', input);
    session.set(data);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      session.set(null);
    }
  }, []);

  const changePassword = useCallback(async (input: ChangePasswordInput) => {
    const { data } = await apiClient.post<AuthResponse>('/auth/change-password', input);
    session.set(data);
    return data.user;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      changePassword,
      can: (...permissions) => !!user && permissions.every((p) => user.permissions.includes(p)),
      hasRole: (role) => !!user?.roles.includes(role),
    }),
    [status, user, login, logout, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
