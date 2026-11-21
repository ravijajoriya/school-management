import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DashboardOverview,
  ExportFormat,
  ImportHistoryItem,
  ImportResult,
  ImportType,
  ReportExportKey,
  StrengthReport,
} from '@school/shared';
import { apiClient } from '@/lib/api-client';

export const useOverview = () =>
  useQuery({
    queryKey: ['reports', 'overview'],
    queryFn: async () => (await apiClient.get<DashboardOverview>('/reports/overview')).data,
    refetchInterval: 5 * 60_000,
  });

export const useStrength = (academicYearId: string, enabled = true) =>
  useQuery({
    queryKey: ['reports', 'strength', academicYearId],
    queryFn: async () =>
      (
        await apiClient.get<StrengthReport>('/reports/strength', {
          params: academicYearId ? { academicYearId } : {},
        })
      ).data,
    enabled,
  });

/** Saves a Blob under the given name (the browser's normal download). */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileNameFrom = (header: unknown, fallback: string) =>
  (typeof header === 'string' && /filename="([^"]+)"/.exec(header)?.[1]) || fallback;

/** Downloads an approved report export (permission-checked and audited on the server). */
export async function downloadExport(
  key: ReportExportKey,
  format: ExportFormat,
  params: Record<string, string | undefined> = {},
) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  const res = await apiClient.get<Blob>(`/reports/exports/${key}`, {
    params: { ...clean, format },
    responseType: 'blob',
  });
  saveBlob(res.data, fileNameFrom(res.headers['content-disposition'], `${key}.${format}`));
}

/** Server errors arrive as a Blob when responseType is 'blob'; turn them back into JSON. */
export async function blobErrorMessage(error: unknown): Promise<string> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const body = JSON.parse(await data.text()) as { message?: string | string[] };
      return Array.isArray(body.message)
        ? body.message.join('; ')
        : (body.message ?? 'Download failed');
    } catch {
      return 'Download failed';
    }
  }
  return 'Download failed';
}

// --- Imports ---------------------------------------------------------------------------------

export async function downloadImportTemplate(type: ImportType) {
  const res = await apiClient.get<Blob>(`/imports/templates/${type}`, { responseType: 'blob' });
  saveBlob(res.data, `${type}-template.csv`);
}

export const useImportHistory = () =>
  useQuery({
    queryKey: ['imports', 'history'],
    queryFn: async () => (await apiClient.get<ImportHistoryItem[]>('/imports/history')).data,
  });

export function useRunImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      type,
      file,
      dryRun,
    }: {
      type: ImportType;
      file: File;
      dryRun: boolean;
    }) => {
      const form = new FormData();
      form.append('file', file);
      return (
        await apiClient.post<ImportResult>(`/imports/${type}`, form, {
          params: { dryRun: String(dryRun) },
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    },
    onSuccess: (r) => {
      if (!r.dryRun && r.created) void qc.invalidateQueries();
    },
  });
}
