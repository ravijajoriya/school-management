import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateLeaveRequestInput,
  LeaveRequestItem,
  LeaveSummary,
  ListLeaveRequestsQuery,
  Paginated,
} from '@school/shared';
import { apiClient } from '@/lib/api-client';

const clean = <T extends object>(params: T) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined));

function useRefreshLeave() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['leave'] });
    // The daily attendance report shows class teachers on leave.
    qc.invalidateQueries({ queryKey: ['attendance', 'daily'] });
  };
}

// --- Self-service (teacher portal) -----------------------------------------------------------

export function useMyLeave(enabled = true) {
  return useQuery({
    queryKey: ['leave', 'mine'],
    queryFn: async () => (await apiClient.get<LeaveRequestItem[]>('/leave-requests/mine')).data,
    enabled,
  });
}

export function useApplyLeave() {
  const refresh = useRefreshLeave();
  return useMutation({
    mutationFn: async (input: CreateLeaveRequestInput) =>
      (await apiClient.post<LeaveRequestItem>('/leave-requests/mine', input)).data,
    onSuccess: refresh,
  });
}

export function useCancelLeave() {
  const refresh = useRefreshLeave();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.post<LeaveRequestItem>(`/leave-requests/mine/${id}/cancel`)).data,
    onSuccess: refresh,
  });
}

// --- Office ----------------------------------------------------------------------------------

export function useLeaveRequests(query: Partial<ListLeaveRequestsQuery>, enabled = true) {
  return useQuery({
    queryKey: ['leave', 'list', query],
    queryFn: async () =>
      (
        await apiClient.get<Paginated<LeaveRequestItem>>('/leave-requests', {
          params: clean(query),
        })
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useLeaveSummary(enabled = true) {
  return useQuery({
    queryKey: ['leave', 'summary'],
    queryFn: async () => (await apiClient.get<LeaveSummary>('/leave-requests/summary')).data,
    enabled,
  });
}

export function useReviewLeave() {
  const refresh = useRefreshLeave();
  return useMutation({
    mutationFn: async ({
      id,
      decision,
      remarks,
    }: {
      id: string;
      decision: 'approve' | 'reject';
      remarks?: string;
    }) =>
      (await apiClient.post<LeaveRequestItem>(`/leave-requests/${id}/${decision}`, { remarks }))
        .data,
    onSuccess: refresh,
  });
}
