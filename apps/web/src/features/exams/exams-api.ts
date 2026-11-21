import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateExaminationInput,
  ExamProgressRow,
  ExaminationItem,
  GradingScaleItem,
  MarksSheet,
  MarksTask,
  ReportCard,
  ReviewMarksInput,
  SaveGradingScaleInput,
  SaveMarksInput,
  SectionResults,
  SetExamSubjectsInput,
  UpdateExaminationInput,
} from '@school/shared';
import { apiClient } from '@/lib/api-client';

function useRefreshExams() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['exams'] });
}

export function useExaminations(academicYearId: string) {
  return useQuery({
    queryKey: ['exams', 'list', academicYearId],
    queryFn: async () =>
      (await apiClient.get<ExaminationItem[]>('/exams', { params: { academicYearId } })).data,
    enabled: !!academicYearId,
  });
}

export function useExamination(id: string) {
  return useQuery({
    queryKey: ['exams', 'one', id],
    queryFn: async () => (await apiClient.get<ExaminationItem>(`/exams/${id}`)).data,
  });
}

export function useExamProgress(id: string, enabled = true) {
  return useQuery({
    queryKey: ['exams', 'progress', id],
    queryFn: async () => (await apiClient.get<ExamProgressRow[]>(`/exams/${id}/progress`)).data,
    enabled,
  });
}

export function useExamActions() {
  const refresh = useRefreshExams();
  const opts = { onSuccess: refresh };
  return {
    create: useMutation({
      mutationFn: async (input: CreateExaminationInput) =>
        (await apiClient.post<ExaminationItem>('/exams', input)).data,
      ...opts,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...input }: UpdateExaminationInput & { id: string }) =>
        (await apiClient.patch<ExaminationItem>(`/exams/${id}`, input)).data,
      ...opts,
    }),
    setSubjects: useMutation({
      mutationFn: async ({ id, ...input }: SetExamSubjectsInput & { id: string }) =>
        (await apiClient.put<ExaminationItem>(`/exams/${id}/subjects`, input)).data,
      ...opts,
    }),
    setStatus: useMutation({
      mutationFn: async ({
        id,
        status,
      }: {
        id: string;
        status: 'DRAFT' | 'SCHEDULED' | 'MARKS_ENTRY';
      }) => (await apiClient.post<ExaminationItem>(`/exams/${id}/status`, { status })).data,
      ...opts,
    }),
    finalize: useMutation({
      mutationFn: async (id: string) =>
        (await apiClient.post<ExaminationItem>(`/exams/${id}/finalize`)).data,
      ...opts,
    }),
  };
}

// --- Marks ---------------------------------------------------------------------------------------

export function useMarksSheet(examSubjectId: string, sectionId: string) {
  return useQuery({
    queryKey: ['exams', 'sheet', examSubjectId, sectionId],
    queryFn: async () =>
      (
        await apiClient.get<MarksSheet>('/exams/marks/sheet', {
          params: { examSubjectId, sectionId },
        })
      ).data,
    enabled: !!examSubjectId && !!sectionId,
  });
}

export function useMarksActions() {
  const refresh = useRefreshExams();
  return {
    save: useMutation({
      mutationFn: async (input: SaveMarksInput) =>
        (await apiClient.put<{ saved: number; cleared: number }>('/exams/marks/sheet', input)).data,
      onSuccess: refresh,
    }),
    submit: useMutation({
      mutationFn: async (input: { examSubjectId: string; sectionId: string }) =>
        (await apiClient.post<{ submitted: number }>('/exams/marks/submit', input)).data,
      onSuccess: refresh,
    }),
    review: useMutation({
      mutationFn: async (input: ReviewMarksInput) =>
        (await apiClient.post<{ updated: number }>('/exams/marks/review', input)).data,
      onSuccess: refresh,
    }),
  };
}

export function useMyMarksTasks() {
  return useQuery({
    queryKey: ['exams', 'my-tasks'],
    queryFn: async () => (await apiClient.get<MarksTask[]>('/exams/marks/my-tasks')).data,
  });
}

// --- Results & grading ---------------------------------------------------------------------------

export function useSectionResults(examinationId: string, sectionId: string) {
  return useQuery({
    queryKey: ['exams', 'results', examinationId, sectionId],
    queryFn: async () =>
      (
        await apiClient.get<SectionResults>('/exams/results', {
          params: { examinationId, sectionId },
        })
      ).data,
    enabled: !!examinationId && !!sectionId,
    placeholderData: keepPreviousData,
  });
}

export function useReportCard(examinationId: string, enrolmentId: string) {
  return useQuery({
    queryKey: ['exams', 'report-card', examinationId, enrolmentId],
    queryFn: async () =>
      (await apiClient.get<ReportCard>(`/exams/${examinationId}/report-cards/${enrolmentId}`)).data,
  });
}

export function useGradingScales() {
  return useQuery({
    queryKey: ['exams', 'grading'],
    queryFn: async () => (await apiClient.get<GradingScaleItem[]>('/exams/grading-scales')).data,
  });
}

export function useSaveGradingScale() {
  const refresh = useRefreshExams();
  return useMutation({
    mutationFn: async ({ id, ...input }: SaveGradingScaleInput & { id?: string }) =>
      id
        ? (await apiClient.put<GradingScaleItem>(`/exams/grading-scales/${id}`, input)).data
        : (await apiClient.post<GradingScaleItem>('/exams/grading-scales', input)).data,
    onSuccess: refresh,
  });
}
