import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CancelPaymentInput,
  CollectionReport,
  ConcessionReport,
  CreateAdjustmentInput,
  CreateChargeInput,
  CreateFeeHeadInput,
  CreateFeeStructureInput,
  DueItem,
  DuesReport,
  FeeHeadItem,
  FeeStructureRow,
  FeeSummary,
  GenerateDuesResult,
  ListPaymentsQuery,
  Paginated,
  PaymentListItem,
  ReceiptView,
  RecordPaymentInput,
  StudentLedger,
  UpdateFeeHeadInput,
  UpdateFeeStructureInput,
} from '@school/shared';
import { apiClient } from '@/lib/api-client';

const clean = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== false),
  );

/** Every fee change can affect ledgers, lists, reports and the dashboard. */
function useRefreshFees() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['fees'] });
}

// --- Set-up ------------------------------------------------------------------------------------

export function useFeeHeads() {
  return useQuery({
    queryKey: ['fees', 'heads'],
    queryFn: async () => (await apiClient.get<FeeHeadItem[]>('/fees/heads')).data,
  });
}

export function useSaveFeeHead() {
  const refresh = useRefreshFees();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: (CreateFeeHeadInput | UpdateFeeHeadInput) & { id?: string }) =>
      id
        ? (await apiClient.patch<FeeHeadItem>(`/fees/heads/${id}`, input)).data
        : (await apiClient.post<FeeHeadItem>('/fees/heads', input)).data,
    onSuccess: refresh,
  });
}

export function useFeeStructures(academicYearId: string) {
  return useQuery({
    queryKey: ['fees', 'structures', academicYearId],
    queryFn: async () =>
      (await apiClient.get<FeeStructureRow[]>('/fees/structures', { params: { academicYearId } }))
        .data,
    enabled: !!academicYearId,
  });
}

export function useSaveFeeStructure() {
  const refresh = useRefreshFees();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: (CreateFeeStructureInput | UpdateFeeStructureInput) & { id?: string }) =>
      id
        ? (await apiClient.patch<FeeStructureRow>(`/fees/structures/${id}`, input)).data
        : (await apiClient.post<FeeStructureRow>('/fees/structures', input)).data,
    onSuccess: refresh,
  });
}

export function useGenerateDues() {
  const refresh = useRefreshFees();
  return useMutation({
    mutationFn: async (target: { structureId: string } | { enrolmentId: string }) =>
      (
        await apiClient.post<GenerateDuesResult>(
          'structureId' in target
            ? `/fees/structures/${target.structureId}/generate-dues`
            : `/fees/enrolments/${target.enrolmentId}/generate-dues`,
        )
      ).data,
    onSuccess: refresh,
  });
}

// --- Ledger --------------------------------------------------------------------------------------

export function useStudentLedger(studentId: string, academicYearId?: string, enabled = true) {
  return useQuery({
    queryKey: ['fees', 'ledger', studentId, academicYearId ?? 'current'],
    queryFn: async () =>
      (
        await apiClient.get<StudentLedger>(`/fees/students/${studentId}/ledger`, {
          params: academicYearId ? { academicYearId } : {},
        })
      ).data,
    enabled: enabled && !!studentId,
  });
}

export function useAddCharge() {
  const refresh = useRefreshFees();
  return useMutation({
    mutationFn: async ({ enrolmentId, ...input }: CreateChargeInput & { enrolmentId: string }) =>
      (await apiClient.post<DueItem>(`/fees/enrolments/${enrolmentId}/charges`, input)).data,
    onSuccess: refresh,
  });
}

export function useDeleteDue() {
  const refresh = useRefreshFees();
  return useMutation({
    mutationFn: async (dueId: string) => apiClient.delete(`/fees/dues/${dueId}`),
    onSuccess: refresh,
  });
}

export function useAddAdjustment() {
  const refresh = useRefreshFees();
  return useMutation({
    mutationFn: async ({ dueId, ...input }: CreateAdjustmentInput & { dueId: string }) =>
      (await apiClient.post<DueItem>(`/fees/dues/${dueId}/adjustments`, input)).data,
    onSuccess: refresh,
  });
}

// --- Payments & receipts -------------------------------------------------------------------------

export function useRecordPayment() {
  const refresh = useRefreshFees();
  return useMutation({
    mutationFn: async (input: RecordPaymentInput) =>
      (await apiClient.post<{ paymentId: string; receiptNumber: string }>('/fees/payments', input))
        .data,
    onSuccess: refresh,
  });
}

export function usePayments(query: Partial<ListPaymentsQuery>) {
  return useQuery({
    queryKey: ['fees', 'payments', query],
    queryFn: async () =>
      (await apiClient.get<Paginated<PaymentListItem>>('/fees/payments', { params: clean(query) }))
        .data,
    placeholderData: keepPreviousData,
  });
}

export function useReceipt(paymentId: string) {
  return useQuery({
    queryKey: ['fees', 'receipt', paymentId],
    queryFn: async () =>
      (await apiClient.get<ReceiptView>(`/fees/payments/${paymentId}/receipt`)).data,
  });
}

export function usePaymentActions() {
  const refresh = useRefreshFees();
  const cancel = useMutation({
    mutationFn: async ({ id, ...input }: CancelPaymentInput & { id: string }) =>
      (await apiClient.post<PaymentListItem>(`/fees/payments/${id}/cancel`, input)).data,
    onSuccess: refresh,
  });
  const cleared = useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.post<PaymentListItem>(`/fees/payments/${id}/cheque-cleared`)).data,
    onSuccess: refresh,
  });
  const bounced = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
      (await apiClient.post<PaymentListItem>(`/fees/payments/${id}/cheque-bounced`, { reason }))
        .data,
    onSuccess: refresh,
  });
  return { cancel, cleared, bounced };
}

// --- Reports -------------------------------------------------------------------------------------

export function useDuesReport(q: {
  academicYearId: string;
  classId?: string;
  sectionId?: string;
  overdueOnly?: boolean;
}) {
  return useQuery({
    queryKey: ['fees', 'reports', 'dues', q],
    queryFn: async () =>
      (await apiClient.get<DuesReport>('/fees/reports/dues', { params: clean(q) })).data,
    enabled: !!q.academicYearId,
    placeholderData: keepPreviousData,
  });
}

export function useCollectionReport(from: string, to: string) {
  return useQuery({
    queryKey: ['fees', 'reports', 'collection', from, to],
    queryFn: async () =>
      (await apiClient.get<CollectionReport>('/fees/reports/collection', { params: { from, to } }))
        .data,
    enabled: !!from && !!to && from <= to,
    placeholderData: keepPreviousData,
  });
}

export function useConcessionReport(from: string, to: string, adjustmentType?: string) {
  return useQuery({
    queryKey: ['fees', 'reports', 'concessions', from, to, adjustmentType],
    queryFn: async () =>
      (
        await apiClient.get<ConcessionReport>('/fees/reports/concessions', {
          params: clean({ from, to, adjustmentType }),
        })
      ).data,
    enabled: !!from && !!to && from <= to,
    placeholderData: keepPreviousData,
  });
}

export function useFeeSummary(enabled = true) {
  return useQuery({
    queryKey: ['fees', 'summary'],
    queryFn: async () => (await apiClient.get<FeeSummary>('/fees/summary')).data,
    enabled,
  });
}
