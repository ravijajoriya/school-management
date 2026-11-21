import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttendanceSheet,
  DailyReport,
  MarkAttendanceInput,
  MarkAttendanceResult,
  MonthlyReport,
  SectionRegister,
  StudentAttendanceSummary,
  TeacherAttendanceSection,
} from '@school/shared';
import { apiClient } from '@/lib/api-client';

/** Shared by the Admin and Teacher portals; the API decides what each user may see or change. */

export function useAttendanceSheet(sectionId: string, date: string) {
  return useQuery({
    queryKey: ['attendance', 'sheet', sectionId, date],
    queryFn: async () =>
      (await apiClient.get<AttendanceSheet>('/attendance/sheet', { params: { sectionId, date } }))
        .data,
    enabled: !!sectionId && !!date,
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MarkAttendanceInput) =>
      (await apiClient.put<MarkAttendanceResult>('/attendance/sheet', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
}

export function useMyAttendanceSections(enabled = true) {
  return useQuery({
    queryKey: ['attendance', 'my-sections'],
    queryFn: async () =>
      (await apiClient.get<TeacherAttendanceSection[]>('/attendance/my-sections')).data,
    enabled,
  });
}

export function useDailyReport(date: string, enabled = true) {
  return useQuery({
    queryKey: ['attendance', 'daily', date],
    queryFn: async () =>
      (await apiClient.get<DailyReport>('/attendance/reports/daily', { params: { date } })).data,
    enabled: enabled && !!date,
    placeholderData: keepPreviousData,
  });
}

export function useMonthlyReport(month: string) {
  return useQuery({
    queryKey: ['attendance', 'monthly', month],
    queryFn: async () =>
      (await apiClient.get<MonthlyReport>('/attendance/reports/monthly', { params: { month } }))
        .data,
    enabled: !!month,
    placeholderData: keepPreviousData,
  });
}

export function useSectionRegister(sectionId: string, month: string) {
  return useQuery({
    queryKey: ['attendance', 'register', sectionId, month],
    queryFn: async () =>
      (
        await apiClient.get<SectionRegister>('/attendance/reports/register', {
          params: { sectionId, month },
        })
      ).data,
    enabled: !!sectionId && !!month,
    placeholderData: keepPreviousData,
  });
}

export function useStudentAttendance(studentId: string, academicYearId?: string) {
  return useQuery({
    queryKey: ['attendance', 'student', studentId, academicYearId ?? 'current'],
    queryFn: async () =>
      (
        await apiClient.get<StudentAttendanceSummary>(`/attendance/students/${studentId}`, {
          params: academicYearId ? { academicYearId } : {},
        })
      ).data,
  });
}
