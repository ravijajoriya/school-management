import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditLogItem,
  CreateRoleInput,
  CreateUserInput,
  ListAuditLogsQuery,
  ListUsersQuery,
  Paginated,
  PasswordResetResponse,
  PermissionItem,
  RoleItem,
  UpdateRoleInput,
  UpdateUserInput,
  UserCreatedResponse,
  UserListItem,
} from '@school/shared';
import { apiClient } from '@/lib/api-client';

/** Drops empty filter values so they don't end up in the query string. */
const clean = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  );

const keys = {
  users: (q: Partial<ListUsersQuery>) => ['users', q] as const,
  roles: ['roles'] as const,
  permissions: ['permissions'] as const,
  audit: (q: Partial<ListAuditLogsQuery>) => ['audit-logs', q] as const,
};

// --- Users ----------------------------------------------------------------------

export function useUsers(query: Partial<ListUsersQuery>) {
  return useQuery({
    queryKey: keys.users(query),
    queryFn: async () =>
      (await apiClient.get<Paginated<UserListItem>>('/users', { params: clean(query) })).data,
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) =>
      (await apiClient.post<UserCreatedResponse>('/users', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateUserInput & { id: string }) =>
      (await apiClient.patch<UserListItem>(`/users/${id}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useSetUserRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, roleIds }: { id: string; roleIds: string[] }) =>
      (await apiClient.put<UserListItem>(`/users/${id}/roles`, { roleIds })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: keys.roles });
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.post<PasswordResetResponse>(`/users/${id}/reset-password`)).data,
  });
}

// --- Roles & permissions ---------------------------------------------------------

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: keys.roles,
    queryFn: async () => (await apiClient.get<RoleItem[]>('/roles')).data,
    enabled,
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: keys.permissions,
    queryFn: async () => (await apiClient.get<PermissionItem[]>('/permissions')).data,
    staleTime: 5 * 60_000,
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRoleInput) =>
      (await apiClient.post<RoleItem>('/roles', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.roles }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateRoleInput & { id: string }) =>
      (await apiClient.patch<RoleItem>(`/roles/${id}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.roles }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.roles }),
  });
}

export function useSetRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, permissionCodes }: { id: string; permissionCodes: string[] }) =>
      (await apiClient.put<RoleItem>(`/roles/${id}/permissions`, { permissionCodes })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.roles }),
  });
}

// --- Audit logs -------------------------------------------------------------------

export function useAuditLogs(query: Partial<ListAuditLogsQuery>) {
  return useQuery({
    queryKey: keys.audit(query),
    queryFn: async () =>
      (await apiClient.get<Paginated<AuditLogItem>>('/audit-logs', { params: clean(query) })).data,
    placeholderData: keepPreviousData,
  });
}
