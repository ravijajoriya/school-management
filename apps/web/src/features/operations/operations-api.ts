import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignTransportInput,
  CertificateIssueItem,
  CertificateTemplateItem,
  ComplaintItem,
  CreateComplaintInput,
  CreateIdCardBatchInput,
  CreateMeetingInput,
  IdCardBatchItem,
  IdCardBatchView,
  IdCardTemplateItem,
  InventoryCategoryItem,
  InventoryItemRow,
  IssueCertificateInput,
  ListComplaintsQuery,
  ListInventoryQuery,
  ListMeetingsQuery,
  MeetingItem,
  Paginated,
  PayrollRunItem,
  PayrollRunListItem,
  PayrollStatus,
  Payslip,
  RouteItem,
  SalaryComponentItem,
  SaveCertificateTemplateInput,
  SaveIdCardTemplateInput,
  SaveInventoryItemInput,
  SavePayrollRecordInput,
  SaveRouteInput,
  SaveSalaryComponentInput,
  SaveVehicleInput,
  TransportAssignmentItem,
  UpdateComplaintInput,
  UpdateMeetingInput,
  VehicleItem,
} from '@school/shared';
import { apiClient } from '@/lib/api-client';

const clean = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== false),
  );

function useRefresh(key: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [key] });
}

/** POST when there is no id, PATCH otherwise. */
const save = async <T>(base: string, id: string | undefined, body: unknown) =>
  id
    ? (await apiClient.patch<T>(`${base}/${id}`, body)).data
    : (await apiClient.post<T>(base, body)).data;

// --- Transport -------------------------------------------------------------------------------

export const useVehicles = () =>
  useQuery({
    queryKey: ['transport', 'vehicles'],
    queryFn: async () => (await apiClient.get<VehicleItem[]>('/transport/vehicles')).data,
  });

export function useSaveVehicle() {
  const refresh = useRefresh('transport');
  return useMutation({
    mutationFn: ({ id, ...input }: SaveVehicleInput & { id?: string }) =>
      save<VehicleItem>('/transport/vehicles', id, input),
    onSuccess: refresh,
  });
}

export const useRoutes = () =>
  useQuery({
    queryKey: ['transport', 'routes'],
    queryFn: async () => (await apiClient.get<RouteItem[]>('/transport/routes')).data,
  });

export function useSaveRoute() {
  const refresh = useRefresh('transport');
  return useMutation({
    mutationFn: ({ id, ...input }: SaveRouteInput & { id?: string }) =>
      save<RouteItem>('/transport/routes', id, input),
    onSuccess: refresh,
  });
}

export const useTransportAssignments = (
  q: { routeId?: string; sectionId?: string; studentId?: string; includeEnded?: boolean },
  enabled = true,
) =>
  useQuery({
    queryKey: ['transport', 'assignments', q],
    queryFn: async () =>
      (
        await apiClient.get<TransportAssignmentItem[]>('/transport/assignments', {
          params: clean(q),
        })
      ).data,
    enabled,
  });

export function useAssignTransport() {
  const refresh = useRefresh('transport');
  return useMutation({
    mutationFn: async (input: AssignTransportInput) =>
      (await apiClient.post<TransportAssignmentItem>('/transport/assignments', input)).data,
    onSuccess: refresh,
  });
}

export function useEndTransport() {
  const refresh = useRefresh('transport');
  return useMutation({
    mutationFn: async ({ id, endDate }: { id: string; endDate: string }) =>
      (
        await apiClient.post<TransportAssignmentItem>(`/transport/assignments/${id}/end`, {
          endDate,
        })
      ).data,
    onSuccess: refresh,
  });
}

// --- Complaints ------------------------------------------------------------------------------

export const useComplaints = (q: Partial<ListComplaintsQuery>) =>
  useQuery({
    queryKey: ['complaints', 'list', q],
    queryFn: async () =>
      (await apiClient.get<Paginated<ComplaintItem>>('/complaints', { params: clean(q) })).data,
    placeholderData: keepPreviousData,
  });

export const useComplaint = (id: string) =>
  useQuery({
    queryKey: ['complaints', 'one', id],
    queryFn: async () => (await apiClient.get<ComplaintItem>(`/complaints/${id}`)).data,
  });

export const useComplaintSummary = () =>
  useQuery({
    queryKey: ['complaints', 'summary'],
    queryFn: async () =>
      (
        await apiClient.get<{
          total: number;
          byStatus: Record<string, number>;
          byCategory: Record<string, number>;
        }>('/complaints/summary')
      ).data,
  });

export const useComplaintAssignees = (enabled: boolean) =>
  useQuery({
    queryKey: ['complaints', 'assignees'],
    queryFn: async () =>
      (await apiClient.get<{ id: string; fullName: string }[]>('/complaints/assignees')).data,
    enabled,
  });

export function useCreateComplaint() {
  const refresh = useRefresh('complaints');
  return useMutation({
    mutationFn: async (input: CreateComplaintInput) =>
      (await apiClient.post<ComplaintItem>('/complaints', input)).data,
    onSuccess: refresh,
  });
}

export function useUpdateComplaint(id: string) {
  const refresh = useRefresh('complaints');
  return useMutation({
    mutationFn: async (input: UpdateComplaintInput) =>
      (await apiClient.patch<ComplaintItem>(`/complaints/${id}`, input)).data,
    onSuccess: refresh,
  });
}

// --- Meetings --------------------------------------------------------------------------------

export const useMeetings = (q: Partial<ListMeetingsQuery>) =>
  useQuery({
    queryKey: ['meetings', q],
    queryFn: async () =>
      (await apiClient.get<Paginated<MeetingItem>>('/meetings', { params: clean(q) })).data,
    placeholderData: keepPreviousData,
  });

export function useCreateMeeting() {
  const refresh = useRefresh('meetings');
  return useMutation({
    mutationFn: async (input: CreateMeetingInput) =>
      (await apiClient.post<MeetingItem>('/meetings', input)).data,
    onSuccess: refresh,
  });
}

export function useUpdateMeeting() {
  const refresh = useRefresh('meetings');
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateMeetingInput & { id: string }) =>
      (await apiClient.patch<MeetingItem>(`/meetings/${id}`, input)).data,
    onSuccess: refresh,
  });
}

// --- Inventory -------------------------------------------------------------------------------

export const useInventoryCategories = () =>
  useQuery({
    queryKey: ['inventory', 'categories'],
    queryFn: async () =>
      (await apiClient.get<InventoryCategoryItem[]>('/inventory/categories')).data,
  });

export function useSaveInventoryCategory() {
  const refresh = useRefresh('inventory');
  return useMutation({
    mutationFn: ({ id, ...input }: { id?: string; name: string; description?: string }) =>
      save<InventoryCategoryItem>('/inventory/categories', id, input),
    onSuccess: refresh,
  });
}

export function useDeleteInventoryCategory() {
  const refresh = useRefresh('inventory');
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/inventory/categories/${id}`),
    onSuccess: refresh,
  });
}

export const useInventoryItems = (q: Partial<ListInventoryQuery>) =>
  useQuery({
    queryKey: ['inventory', 'items', q],
    queryFn: async () =>
      (await apiClient.get<Paginated<InventoryItemRow>>('/inventory/items', { params: clean(q) }))
        .data,
    placeholderData: keepPreviousData,
  });

export interface InventorySummary {
  categories: {
    id: string;
    name: string;
    items: number;
    quantity: number;
    value: number;
    needsAttention: number;
  }[];
  byCondition: Record<string, number>;
  totalValue: number;
}
export const useInventorySummary = () =>
  useQuery({
    queryKey: ['inventory', 'summary'],
    queryFn: async () => (await apiClient.get<InventorySummary>('/inventory/summary')).data,
  });

export function useSaveInventoryItem() {
  const refresh = useRefresh('inventory');
  return useMutation({
    mutationFn: ({ id, ...input }: SaveInventoryItemInput & { id?: string }) =>
      save<InventoryItemRow>('/inventory/items', id, input),
    onSuccess: refresh,
  });
}

export function useDeleteInventoryItem() {
  const refresh = useRefresh('inventory');
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/inventory/items/${id}`),
    onSuccess: refresh,
  });
}

// --- Payroll ---------------------------------------------------------------------------------

export const useSalaryComponents = () =>
  useQuery({
    queryKey: ['payroll', 'components'],
    queryFn: async () => (await apiClient.get<SalaryComponentItem[]>('/payroll/components')).data,
  });

export function useSaveSalaryComponent() {
  const refresh = useRefresh('payroll');
  return useMutation({
    mutationFn: ({ id, ...input }: SaveSalaryComponentInput & { id?: string }) =>
      save<SalaryComponentItem>('/payroll/components', id, input),
    onSuccess: refresh,
  });
}

export const usePayrollRuns = () =>
  useQuery({
    queryKey: ['payroll', 'runs'],
    queryFn: async () => (await apiClient.get<PayrollRunListItem[]>('/payroll/runs')).data,
  });

export const usePayrollRun = (id: string) =>
  useQuery({
    queryKey: ['payroll', 'run', id],
    queryFn: async () => (await apiClient.get<PayrollRunItem>(`/payroll/runs/${id}`)).data,
  });

/** Every payroll action returns the updated run. */
export function usePayrollAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      a:
        | { kind: 'create'; month: string }
        | { kind: 'record'; runId: string; recordId: string; body: SavePayrollRecordInput }
        | { kind: 'add'; runId: string; employeeId: string }
        | { kind: 'remove'; runId: string; recordId: string }
        | { kind: 'approve' | 'pay'; runId: string }
        | { kind: 'reopen'; runId: string; reason: string }
        | { kind: 'delete'; runId: string },
    ): Promise<PayrollRunItem | null> => {
      switch (a.kind) {
        case 'create':
          return (await apiClient.post<PayrollRunItem>('/payroll/runs', { month: a.month })).data;
        case 'record':
          return (
            await apiClient.put<PayrollRunItem>(
              `/payroll/runs/${a.runId}/records/${a.recordId}`,
              a.body,
            )
          ).data;
        case 'add':
          return (
            await apiClient.post<PayrollRunItem>(`/payroll/runs/${a.runId}/records`, {
              employeeId: a.employeeId,
            })
          ).data;
        case 'remove':
          return (
            await apiClient.delete<PayrollRunItem>(`/payroll/runs/${a.runId}/records/${a.recordId}`)
          ).data;
        case 'reopen':
          return (
            await apiClient.post<PayrollRunItem>(`/payroll/runs/${a.runId}/reopen`, {
              reason: a.reason,
            })
          ).data;
        case 'delete':
          await apiClient.delete(`/payroll/runs/${a.runId}`);
          return null;
        default:
          return (await apiClient.post<PayrollRunItem>(`/payroll/runs/${a.runId}/${a.kind}`)).data;
      }
    },
    onSuccess: async (run) => {
      if (run) qc.setQueryData(['payroll', 'run', run.id], run);
      await qc.invalidateQueries({ queryKey: ['payroll', 'runs'] });
    },
  });
}

export const usePayslip = (recordId: string, mine: boolean) =>
  useQuery({
    queryKey: ['payroll', 'payslip', mine, recordId],
    queryFn: async () =>
      (
        await apiClient.get<Payslip>(
          mine ? `/payroll/mine/${recordId}` : `/payroll/records/${recordId}/payslip`,
        )
      ).data,
  });

export const useMyPayslips = () =>
  useQuery({
    queryKey: ['payroll', 'mine'],
    queryFn: async () =>
      (
        await apiClient.get<{ id: string; month: string; status: PayrollStatus; net: number }[]>(
          '/payroll/mine',
        )
      ).data,
    retry: false,
  });

// --- Certificates & ID cards -----------------------------------------------------------------

export const useCertificateTemplates = () =>
  useQuery({
    queryKey: ['certificates', 'templates'],
    queryFn: async () =>
      (await apiClient.get<CertificateTemplateItem[]>('/certificates/templates')).data,
  });

export function useSaveCertificateTemplate() {
  const refresh = useRefresh('certificates');
  return useMutation({
    mutationFn: ({ id, ...input }: SaveCertificateTemplateInput & { id?: string }) =>
      save<CertificateTemplateItem>('/certificates/templates', id, input),
    onSuccess: refresh,
  });
}

export const useCertificates = (q: { studentId?: string; page?: number }) =>
  useQuery({
    queryKey: ['certificates', 'list', q],
    queryFn: async () =>
      (await apiClient.get<Paginated<CertificateIssueItem>>('/certificates', { params: clean(q) }))
        .data,
    placeholderData: keepPreviousData,
  });

export const useCertificate = (id: string) =>
  useQuery({
    queryKey: ['certificates', 'one', id],
    queryFn: async () => (await apiClient.get<CertificateIssueItem>(`/certificates/${id}`)).data,
  });

export function useIssueCertificate() {
  const refresh = useRefresh('certificates');
  return useMutation({
    mutationFn: async (input: IssueCertificateInput) =>
      (await apiClient.post<CertificateIssueItem>('/certificates', input)).data,
    onSuccess: refresh,
  });
}

export const useIdCardTemplates = () =>
  useQuery({
    queryKey: ['id-cards', 'templates'],
    queryFn: async () => (await apiClient.get<IdCardTemplateItem[]>('/id-cards/templates')).data,
  });

export function useSaveIdCardTemplate() {
  const refresh = useRefresh('id-cards');
  return useMutation({
    mutationFn: ({ id, ...input }: SaveIdCardTemplateInput & { id?: string }) =>
      save<IdCardTemplateItem>('/id-cards/templates', id, input),
    onSuccess: refresh,
  });
}

export const useIdCardBatches = () =>
  useQuery({
    queryKey: ['id-cards', 'batches'],
    queryFn: async () => (await apiClient.get<IdCardBatchItem[]>('/id-cards/batches')).data,
  });

export const useIdCardBatch = (id: string) =>
  useQuery({
    queryKey: ['id-cards', 'batch', id],
    queryFn: async () => (await apiClient.get<IdCardBatchView>(`/id-cards/batches/${id}`)).data,
  });

export function useCreateIdCardBatch() {
  const refresh = useRefresh('id-cards');
  return useMutation({
    mutationFn: async (input: CreateIdCardBatchInput) =>
      (await apiClient.post<IdCardBatchView>('/id-cards/batches', input)).data,
    onSuccess: refresh,
  });
}
