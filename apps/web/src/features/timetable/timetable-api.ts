import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTimetableInput,
  SaveTimetableEntriesInput,
  TeacherTimetable,
  TimetableClash,
  TimetableItem,
  TimetableListItem,
  UpdateTimetableInput,
} from '@school/shared';
import { apiClient } from '@/lib/api-client';

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['timetables'] });
}

export function useTimetables(academicYearId: string) {
  return useQuery({
    queryKey: ['timetables', 'list', academicYearId],
    queryFn: async () =>
      (await apiClient.get<TimetableListItem[]>('/timetables', { params: { academicYearId } }))
        .data,
    enabled: !!academicYearId,
  });
}

export function useTimetable(id: string) {
  return useQuery({
    queryKey: ['timetables', 'one', id],
    queryFn: async () => (await apiClient.get<TimetableItem>(`/timetables/${id}`)).data,
  });
}

export function useTimetableClashes(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['timetables', 'clashes', id],
    queryFn: async () => (await apiClient.get<TimetableClash[]>(`/timetables/${id}/clashes`)).data,
    enabled,
  });
}

export function useTeacherTimetable(employeeId: string) {
  return useQuery({
    queryKey: ['timetables', 'teacher', employeeId],
    queryFn: async () =>
      (await apiClient.get<TeacherTimetable>(`/timetables/teachers/${employeeId}`)).data,
    enabled: !!employeeId,
  });
}

export function useMyTimetable() {
  return useQuery({
    queryKey: ['timetables', 'mine'],
    queryFn: async () => (await apiClient.get<TeacherTimetable | null>('/timetables/mine')).data,
  });
}

export function useTimetableActions() {
  const refresh = useRefresh();
  return {
    create: useMutation({
      mutationFn: async (input: CreateTimetableInput) =>
        (await apiClient.post<TimetableItem>('/timetables', input)).data,
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...input }: UpdateTimetableInput & { id: string }) =>
        (await apiClient.patch<TimetableItem>(`/timetables/${id}`, input)).data,
      onSuccess: refresh,
    }),
    saveEntries: useMutation({
      mutationFn: async ({ id, ...input }: SaveTimetableEntriesInput & { id: string }) =>
        (await apiClient.put<TimetableItem>(`/timetables/${id}/entries`, input)).data,
      onSuccess: refresh,
    }),
    publish: useMutation({
      mutationFn: async (id: string) =>
        (await apiClient.post<TimetableItem>(`/timetables/${id}/publish`)).data,
      onSuccess: refresh,
    }),
    archive: useMutation({
      mutationFn: async (id: string) =>
        (await apiClient.post<TimetableItem>(`/timetables/${id}/archive`)).data,
      onSuccess: refresh,
    }),
  };
}
