import type { RosterItem, TeacherSectionItem } from '@school/shared';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

/** Sections the signed-in teacher is class teacher of or teaches a subject in (active year). */
export function useMySections() {
  return useQuery({
    queryKey: ['teacher', 'sections'],
    queryFn: async () => (await apiClient.get<TeacherSectionItem[]>('/teacher/sections')).data,
  });
}

export function useRoster(sectionId: string) {
  return useQuery({
    queryKey: ['teacher', 'roster', sectionId],
    queryFn: async () =>
      (await apiClient.get<RosterItem[]>(`/teacher/sections/${sectionId}/students`)).data,
    enabled: !!sectionId,
  });
}
