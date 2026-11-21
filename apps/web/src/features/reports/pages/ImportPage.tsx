import {
  IMPORT_COLUMNS,
  IMPORT_TYPES,
  IMPORT_TYPE_LABELS,
  type ImportResult,
  type ImportType,
} from '@school/shared';
import { CheckCircle2, Download, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, Field, PageHeader, Select } from '@/components/ui';
import { errorMessages } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { downloadImportTemplate, useImportHistory, useRunImport } from '../reports-api';

/**
 * Go-live data import: download the template, fill it in (Excel or CSV), check the file (nothing
 * is saved), fix any errors, then import. Imports are all-or-nothing and end with a reconciliation.
 */
export function ImportPage() {
  const [type, setType] = useState<ImportType>('students');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const run = useRunImport();
  const history = useImportHistory();

  const go = async (dryRun: boolean) => {
    if (!file) return;
    if (
      !dryRun &&
      !window.confirm(`Import ${file.name}? This adds the records to the live system.`)
    )
      return;
    setError(null);
    try {
      setResult(await run.mutateAsync({ type, file, dryRun }));
    } catch (e) {
      setResult(null);
      setError(
        errorMessages(e)
          .join(' ')
          .replace(/^file: /, ''),
      );
    }
  };
  const reset = (t: ImportType) => {
    setType(t);
    setFile(null);
    setResult(null);
    setError(null);
    if (input.current) input.current.value = '';
  };
  const checked = result?.dryRun && result.errors.length === 0 && result.fileName === file?.name;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Import data"
        description="Bring records over from spreadsheets when the school starts using the system."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-4 p-5">
          <Field label="What are you importing?" htmlFor="im-type">
            <Select id="im-type" value={type} onChange={(e) => reset(e.target.value as ImportType)}>
              {IMPORT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {IMPORT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
            <li>
              Download the template, fill it in Excel (one row per record) and save it as .xlsx or
              .csv.
            </li>
            <li>Check the file. Nothing is saved; every problem is listed with its row number.</li>
            <li>Fix the problems and check again. When it is clean, import it.</li>
          </ol>
          <Button variant="secondary" onClick={() => void downloadImportTemplate(type)}>
            <Download className="h-4 w-4" aria-hidden="true" /> Download template
          </Button>
          <Field label="Spreadsheet" htmlFor="im-file" hint=".xlsx or .csv, up to 5,000 rows">
            <input
              ref={input}
              id="im-file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="block w-full text-sm"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
                setError(null);
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!file}
              loading={run.isPending && run.variables?.dryRun}
              onClick={() => go(true)}
            >
              Check file
            </Button>
            <Button
              disabled={!checked}
              loading={run.isPending && run.variables?.dryRun === false}
              onClick={() => go(false)}
            >
              Import
            </Button>
          </div>
          {error && <Alert>{error}</Alert>}
          {result && <ResultView result={result} />}
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-ink">Columns</h2>
          <ul className="space-y-1 text-xs">
            {IMPORT_COLUMNS[type].map((c) => (
              <li key={c.name}>
                <code className={c.required ? 'font-semibold text-ink' : 'text-ink-muted'}>
                  {c.name}
                </code>
                {c.required && <span className="text-red-700"> *</span>}
                {c.description && <span className="text-ink-muted"> — {c.description}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="border-b border-gray-100 p-4 text-sm font-semibold text-ink">
          Past imports
        </h2>
        {!history.data?.length ? (
          <EmptyState title="Nothing imported yet" />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">What</th>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 text-right font-medium">Created</th>
                <th className="px-4 py-3 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.data.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-2">{formatDateTime(h.at)}</td>
                  <td className="px-4 py-2">{IMPORT_TYPE_LABELS[h.type]}</td>
                  <td className="px-4 py-2 font-mono text-xs">{h.fileName}</td>
                  <td className="px-4 py-2 text-right">
                    {h.created} of {h.rows}
                  </td>
                  <td className="px-4 py-2">{h.by ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function ResultView({ result: r }: { result: ImportResult }) {
  return (
    <div className="space-y-3">
      {r.errors.length > 0 ? (
        <Alert>
          {r.errors.length} problem{r.errors.length === 1 ? '' : 's'} in {r.totalRows} rows. Nothing
          was saved — fix the file and check it again.
        </Alert>
      ) : r.dryRun ? (
        <Alert tone="info">All {r.totalRows} rows are valid. Click Import to add them.</Alert>
      ) : (
        <Alert tone="success">
          Imported {r.created} record{r.created === 1 ? '' : 's'} from {r.fileName}.
        </Alert>
      )}
      {r.errors.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-md border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Column</th>
                <th className="px-3 py-2 font-medium">Problem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {r.errors.map((e, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5">{e.row}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{e.column ?? '—'}</td>
                  <td className="px-3 py-1.5">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-ink">
          {r.dryRun ? 'File summary' : 'Reconciliation'}
        </h3>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1 font-medium" />
              <th className="py-1 text-right font-medium">In file</th>
              <th className="py-1 text-right font-medium">In system</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {r.reconciliation.map((x) => (
              <tr key={x.label}>
                <td className="py-1">{x.label}</td>
                <td className="py-1 text-right tabular-nums">{x.file}</td>
                <td className="py-1 text-right tabular-nums">{x.system}</td>
                <td className="py-1 pl-2">
                  {r.dryRun ? null : x.ok ? (
                    <Badge tone="green">
                      <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                      Matches
                    </Badge>
                  ) : (
                    <Badge tone="red">
                      <XCircle className="mr-1 h-3 w-3" aria-hidden="true" />
                      Differs
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
