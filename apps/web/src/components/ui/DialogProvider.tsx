import { CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  DialogContext,
  type ConfirmOptions,
  type DialogApi,
  type PromptOptions,
} from '@/lib/dialogs';
import { Button, Field, Input, Modal } from './index';

type Request =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void };

/**
 * App-wide confirm / prompt dialogs (replacing the browser's window.confirm and window.prompt):
 * branded, animated, keyboard friendly, and red for destructive actions.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [value, setValue] = useState('');

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setRequest({ kind: 'confirm', options, resolve })),
    [],
  );
  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setValue(options.defaultValue ?? '');
        setRequest({ kind: 'prompt', options, resolve });
      }),
    [],
  );
  const api = useMemo<DialogApi>(() => ({ confirm, prompt }), [confirm, prompt]);

  const close = (accepted: boolean) => {
    if (!request) return;
    if (request.kind === 'confirm') request.resolve(accepted);
    else request.resolve(accepted ? value.trim() : null);
    setRequest(null);
  };

  const o = request?.options;
  const tone = o?.tone ?? 'primary';
  const Icon =
    o?.icon ?? (tone === 'danger' ? TriangleAlert : tone === 'success' ? CircleCheck : CircleHelp);
  const isPrompt = request?.kind === 'prompt';
  const p = isPrompt ? (o as PromptOptions) : null;
  const blocked = !!p && p.required !== false && !value.trim();

  return (
    <DialogContext.Provider value={api}>
      {children}
      {request && o && (
        <Modal
          open
          size="sm"
          onClose={() => close(false)}
          title={o.title}
          icon={Icon}
          tone={tone === 'danger' ? 'danger' : tone === 'success' ? 'success' : 'navy'}
          footer={
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                {o.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={tone === 'danger' ? 'danger' : 'primary'}
                disabled={blocked}
                onClick={() => close(true)}
                data-autofocus={isPrompt ? undefined : true}
              >
                {o.confirmLabel ?? (isPrompt ? 'Continue' : 'Confirm')}
              </Button>
            </>
          }
        >
          {(o.message || p) && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!blocked) close(true);
              }}
            >
              {o.message && (
                <div className="text-sm leading-relaxed text-ink-muted">{o.message}</div>
              )}
              {p && (
                <Field
                  label={p.label}
                  htmlFor="dialog-input"
                  hint={p.hint}
                  required={p.required !== false}
                >
                  {p.multiline ? (
                    <textarea
                      id="dialog-input"
                      rows={3}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
                      placeholder={p.placeholder}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  ) : (
                    <Input
                      id="dialog-input"
                      type={p.inputType ?? 'text'}
                      placeholder={p.placeholder}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  )}
                </Field>
              )}
            </form>
          )}
        </Modal>
      )}
    </DialogContext.Provider>
  );
}
