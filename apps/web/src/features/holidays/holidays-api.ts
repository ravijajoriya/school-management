import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HolidayItem, SaveHolidayInput } from '@school/shared';
import { apiClient } from '@/lib/api-client';

/** Holidays of a year, or overlapping a date range (any signed-in user may read them). */
export const useHolidays = (
  q: { academicYearId?: string; from?: string; to?: string },
  enabled = true,
) =>
  useQuery({
    queryKey: ['holidays', q],
    queryFn: async () =>
      (
        await apiClient.get<HolidayItem[]>('/holidays', {
          params: Object.fromEntries(Object.entries(q).filter(([, v]) => v)),
        })
      ).data,
    enabled,
  });

export function useSaveHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: SaveHolidayInput & { id?: string }) =>
      id
        ? (await apiClient.patch<HolidayItem>(`/holidays/${id}`, input)).data
        : (await apiClient.post<HolidayItem>('/holidays', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holidays'] }),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/holidays/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holidays'] }),
  });
}
