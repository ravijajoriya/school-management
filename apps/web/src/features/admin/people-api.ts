import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  StaffRoleOption,
  AcademicYearItem,
  ClassStructure,
  ClassSubjectItem,
  ConvertEnquiryInput,
  CreateAcademicYearInput,
  CreateEmployeeInput,
  CreateSectionInput,
  CreateStudentInput,
  CreateSubjectInput,
  CreateTeacherAssignmentInput,
  DocumentItem,
  EmployeeDetail,
  EmployeeListItem,
  EmployeeOption,
  EnrolmentExitInput,
  EnrolmentInput,
  GuardianInput,
  ListEmployeesQuery,
  ListStudentsQuery,
  Paginated,
  PromotionInput,
  PromotionResult,
  SectionItem,
  SetClassSubjectsInput,
  StudentDetail,
  StudentListItem,
  SubjectItem,
  TeacherAssignmentItem,
  UpdateAcademicYearInput,
  UpdateEmployeeInput,
  UpdateEnrolmentInput,
  UpdateGuardianInput,
  UpdateSectionInput,
  UpdateStudentInput,
  UpdateSubjectInput,
  UserCreatedResponse,
} from '@school/shared';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

const clean = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  );

function useRefresh() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

// --- Academic years & structure -------------------------------------------------------------

export function useAcademicYears() {
  return useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => (await apiClient.get<AcademicYearItem[]>('/academic-years')).data,
  });
}

/** Selected year state that defaults to the active year once years load. */
export function useYearSelection() {
  const years = useAcademicYears();
  const [chosen, setChosen] = useState<string>('');
  const yearId = chosen || years.data?.find((y) => y.isActive)?.id || years.data?.[0]?.id || '';
  return { years, yearId, setYearId: setChosen, year: years.data?.find((y) => y.id === yearId) };
}

export function useSaveYear() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: (CreateAcademicYearInput | UpdateAcademicYearInput) & { id?: string }) =>
      id
        ? (await apiClient.patch<AcademicYearItem>(`/academic-years/${id}`, input)).data
        : (await apiClient.post<AcademicYearItem>('/academic-years', input)).data,
    onSuccess: () => refresh('academic-years'),
  });
}

export function useActivateYear() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.post<AcademicYearItem>(`/academic-years/${id}/activate`)).data,
    onSuccess: () => refresh('academic-years', 'structure', 'students'),
  });
}

export function useCopyStructure() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, fromAcademicYearId }: { id: string; fromAcademicYearId: string }) =>
      (
        await apiClient.post<{ sections: number; classSubjects: number }>(
          `/academic-years/${id}/copy-structure`,
          { fromAcademicYearId },
        )
      ).data,
    onSuccess: () => refresh('academic-years', 'structure'),
  });
}

export function useStructure(academicYearId: string) {
  return useQuery({
    queryKey: ['structure', academicYearId],
    queryFn: async () =>
      (await apiClient.get<ClassStructure[]>('/academic-structure', { params: { academicYearId } }))
        .data,
    enabled: !!academicYearId,
  });
}

/** Flat list of sections for a year, labelled "Class 5 – A". */
export function useSectionOptions(academicYearId: string) {
  const structure = useStructure(academicYearId);
  const options = (structure.data ?? []).flatMap((c) =>
    c.sections
      .filter((s) => s.isActive)
      .map((s) => ({ ...s, label: `${c.class.name} – ${s.name}`, levelOrder: c.class.levelOrder })),
  );
  return { ...structure, options };
}

export function useSaveSection() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: (CreateSectionInput | UpdateSectionInput) & { id?: string }) =>
      id
        ? (await apiClient.patch<SectionItem>(`/sections/${id}`, input)).data
        : (await apiClient.post<SectionItem>('/sections', input)).data,
    onSuccess: () => refresh('structure', 'academic-years'),
  });
}

export function useDeleteSection() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/sections/${id}`),
    onSuccess: () => refresh('structure', 'academic-years'),
  });
}

export function useAssignRollNumbers() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({
      sectionId,
      order,
    }: {
      sectionId: string;
      order: 'NAME' | 'ADMISSION_NUMBER';
    }) =>
      (
        await apiClient.post<{ count: number }>(`/sections/${sectionId}/assign-roll-numbers`, {
          order,
        })
      ).data,
    onSuccess: () => refresh('students', 'student'),
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: ['subjects'],
    queryFn: async () => (await apiClient.get<SubjectItem[]>('/subjects')).data,
  });
}

export function useSaveSubject() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: (CreateSubjectInput | UpdateSubjectInput) & { id?: string }) =>
      id
        ? (await apiClient.patch<SubjectItem>(`/subjects/${id}`, input)).data
        : (await apiClient.post<SubjectItem>('/subjects', input)).data,
    onSuccess: () => refresh('subjects', 'structure'),
  });
}

export function useSetClassSubjects() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: SetClassSubjectsInput) =>
      (await apiClient.put<ClassSubjectItem[]>('/class-subjects', input)).data,
    onSuccess: () => refresh('structure'),
  });
}

export function useTeacherAssignments(academicYearId: string) {
  return useQuery({
    queryKey: ['teacher-assignments', academicYearId],
    queryFn: async () =>
      (
        await apiClient.get<TeacherAssignmentItem[]>('/teacher-assignments', {
          params: { academicYearId },
        })
      ).data,
    enabled: !!academicYearId,
  });
}

export function useCreateAssignment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: CreateTeacherAssignmentInput) =>
      (await apiClient.post<TeacherAssignmentItem>('/teacher-assignments', input)).data,
    onSuccess: () => refresh('teacher-assignments', 'employee'),
  });
}

export function useDeleteAssignment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/teacher-assignments/${id}`),
    onSuccess: () => refresh('teacher-assignments', 'employee'),
  });
}

// --- Employees ----------------------------------------------------------------------------

export function useEmployees(query: Partial<ListEmployeesQuery>) {
  return useQuery({
    queryKey: ['employees', query],
    queryFn: async () =>
      (await apiClient.get<Paginated<EmployeeListItem>>('/employees', { params: clean(query) }))
        .data,
    placeholderData: keepPreviousData,
  });
}

/** Roles held by at least one staff member (staff list filter). */
export const useStaffRoleOptions = () =>
  useQuery({
    queryKey: ['employees', 'role-options'],
    queryFn: async () => (await apiClient.get<StaffRoleOption[]>('/employees/role-options')).data,
  });

export function useEmployeeOptions() {
  return useQuery({
    queryKey: ['employees', 'options'],
    queryFn: async () => (await apiClient.get<EmployeeOption[]>('/employees/options')).data,
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: ['employee', id],
    queryFn: async () => (await apiClient.get<EmployeeDetail>(`/employees/${id}`)).data,
  });
}

export function useSaveEmployee() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: (CreateEmployeeInput | UpdateEmployeeInput) & { id?: string }) =>
      id
        ? (await apiClient.patch<EmployeeListItem>(`/employees/${id}`, input)).data
        : (await apiClient.post<EmployeeListItem>('/employees', input)).data,
    onSuccess: () => refresh('employees', 'employee', 'transport'),
  });
}

export function useCreateEmployeeLogin() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, roleIds }: { id: string; roleIds: string[] }) =>
      (await apiClient.post<UserCreatedResponse>(`/employees/${id}/create-login`, { roleIds }))
        .data,
    onSuccess: () => refresh('employees', 'employee', 'users'),
  });
}

/** Link an existing login to a staff record (or unlink with null). */
export function useLinkEmployeeUser() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string | null }) =>
      (await apiClient.patch<EmployeeDetail>(`/employees/${id}/user`, { userId })).data,
    onSuccess: () => refresh('employees', 'employee', 'transport'),
  });
}

// --- Students -----------------------------------------------------------------------------

export function useStudents(query: Partial<ListStudentsQuery>) {
  return useQuery({
    queryKey: ['students', query],
    queryFn: async () =>
      (await apiClient.get<Paginated<StudentListItem>>('/students', { params: clean(query) })).data,
    placeholderData: keepPreviousData,
  });
}

/** Calendar years students were admitted in (newest first). */
export const useAdmissionYears = () =>
  useQuery({
    queryKey: ['students', 'admission-years'],
    queryFn: async () => (await apiClient.get<number[]>('/students/admission-years')).data,
    staleTime: 5 * 60_000,
  });

export function useStudent(id: string) {
  return useQuery({
    queryKey: ['student', id],
    queryFn: async () => (await apiClient.get<StudentDetail>(`/students/${id}`)).data,
  });
}

export function useCreateStudent() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: CreateStudentInput) =>
      (await apiClient.post<StudentDetail>('/students', input)).data,
    onSuccess: () => refresh('students', 'structure'),
  });
}

/** Mutations on one student; every call refreshes the student and the lists. */
export function useStudentActions(studentId: string) {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ['student', studentId] });
    qc.invalidateQueries({ queryKey: ['students'] });
    qc.invalidateQueries({ queryKey: ['structure'] });
  };
  const useAction = <A>(fn: (a: A) => Promise<unknown>) =>
    useMutation({ mutationFn: fn, onSuccess: done });
  return {
    update: useAction(async (input: UpdateStudentInput) =>
      apiClient.patch(`/students/${studentId}`, input),
    ),
    addGuardian: useAction(async (input: GuardianInput) =>
      apiClient.post(`/students/${studentId}/guardians`, input),
    ),
    updateGuardian: useAction(async ({ id, ...input }: UpdateGuardianInput & { id: string }) =>
      apiClient.patch(`/students/${studentId}/guardians/${id}`, input),
    ),
    removeGuardian: useAction(async (id: string) =>
      apiClient.delete(`/students/${studentId}/guardians/${id}`),
    ),
    enrol: useAction(async (input: EnrolmentInput) =>
      apiClient.post(`/students/${studentId}/enrolments`, input),
    ),
    updateEnrolment: useAction(async ({ id, ...input }: UpdateEnrolmentInput & { id: string }) =>
      apiClient.patch(`/enrolments/${id}`, input),
    ),
    exit: useAction(
      async ({
        id,
        kind,
        ...input
      }: EnrolmentExitInput & { id: string; kind: 'transfer' | 'withdraw' }) =>
        apiClient.post(`/enrolments/${id}/${kind}`, input),
    ),
    uploadPhoto: useAction(async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiClient.put(`/students/${studentId}/photo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }),
  };
}

export function usePromote() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: PromotionInput) =>
      (await apiClient.post<PromotionResult>('/promotions', input)).data,
    onSuccess: () => refresh('students', 'student', 'structure', 'academic-years'),
  });
}

export function useConvertEnquiry(enquiryId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: ConvertEnquiryInput) =>
      (await apiClient.post<StudentDetail>(`/enquiries/${enquiryId}/convert`, input)).data,
    onSuccess: () => refresh('enquiries', 'students', 'structure'),
  });
}

// --- Documents (staff & students) ---------------------------------------------------------

export function useDocumentActions(basePath: string, refreshKey: string) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: [refreshKey] });
  const upload = useMutation({
    mutationFn: async ({ file, documentType }: { file: File; documentType: string }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('documentType', documentType);
      return (
        await apiClient.post<DocumentItem>(`${basePath}/documents`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`${basePath}/documents/${id}`),
    onSuccess: done,
  });
  return { upload, remove };
}

/** Downloads a private file with the sign-in token and saves it in the browser. */
export async function downloadPrivateFile(path: string, fileName: string) {
  const res = await apiClient.get<Blob>(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Object URL for a private image (e.g. student photo); null while loading or missing. */
export function usePrivateImage(path: string | null, version = 0) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let revoked = false;
    let objectUrl: string | null = null;
    apiClient
      .get<Blob>(path, { responseType: 'blob' })
      .then((res) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, version]);
  return path ? url : null;
}
