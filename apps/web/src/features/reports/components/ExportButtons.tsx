import { REPORT_EXPORTS, type ExportFormat, type ReportExportKey } from '@school/shared';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { blobErrorMessage, downloadExport } from '../reports-api';

/**
 * "CSV" and "Excel" download buttons for an approved export. Hidden for users without the
 * report's permission (the server checks again and records every download in the audit log).
 */
export function ExportButtons({
  report,
  params = {},
  disabled,
  size = 'sm',
}: {
  report: ReportExportKey;
  params?: Record<string, string | undefined>;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const { can } = useAuth();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!can(REPORT_EXPORTS[report].permission)) return null;
  const go = async (format: ExportFormat) => {
    setBusy(format);
    setError(null);
    try {
      await downloadExport(report, format, params);
    } catch (e) {
      setError(await blobErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2 print:hidden">
      <Button
        size={size}
        variant="secondary"
        disabled={disabled}
        loading={busy === 'csv'}
        onClick={() => go('csv')}
      >
        <Download className="h-4 w-4" aria-hidden="true" /> CSV
      </Button>
      <Button
        size={size}
        variant="secondary"
        disabled={disabled}
        loading={busy === 'xlsx'}
        onClick={() => go('xlsx')}
      >
        <Download className="h-4 w-4" aria-hidden="true" /> Excel
      </Button>
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
