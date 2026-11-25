import { DOCUMENT_TYPE_LABELS, type DocumentItem } from '@school/shared';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert, Button, Card, Select } from '@/components/ui';
import { errorMessages } from '@/lib/api-client';
import { formatBytes, formatDateTime } from '@/lib/format';
import { downloadPrivateFile, useDocumentActions } from '../people-api';
import { useConfirm } from '@/lib/dialogs';

/** Private documents of a staff member or student: upload, download, delete. */
export function DocumentsPanel({
  basePath,
  refreshKey,
  documents,
  types,
  canManage,
  canDownload = true,
}: {
  basePath: string;
  refreshKey: string;
  documents: DocumentItem[];
  types: readonly string[];
  canManage: boolean;
  canDownload?: boolean;
}) {
  const confirm = useConfirm();
  const { upload, remove } = useDocumentActions(basePath, refreshKey);
  const [type, setType] = useState(types[0]);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      await upload.mutateAsync({ file, documentType: type });
    } catch (e) {
      setError(errorMessages(e)[0].replace(/^file: /, ''));
    }
  };

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-brand-navy">Documents</h2>
      <p className="text-xs text-ink-muted">
        Private — only staff with permission can download. PDF, JPEG or PNG up to 10 MB.
      </p>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Select
            className="max-w-[220px]"
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Document type"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </Select>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button
            variant="secondary"
            onClick={() => input.current?.click()}
            loading={upload.isPending}
          >
            <Upload className="h-4 w-4" aria-hidden="true" /> Upload
          </Button>
        </div>
      )}
      {documents.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No documents uploaded.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-5 w-5 shrink-0 text-brand-gold" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {d.fileName} · {formatBytes(d.fileSizeBytes)} · {formatDateTime(d.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0">
                {canDownload && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Download ${d.fileName}`}
                    onClick={() =>
                      downloadPrivateFile(`${basePath}/documents/${d.id}`, d.fileName).catch((e) =>
                        setError(errorMessages(e)[0]),
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${d.fileName}`}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: 'Delete this document?',
                          confirmLabel: 'Delete',
                          tone: 'danger',
                        })
                      )
                        void remove.mutate(d.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
