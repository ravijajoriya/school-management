import type { LucideIcon } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red button and warning icon (deletes, voids, irreversible steps). */
  tone?: 'primary' | 'danger' | 'success';
  icon?: LucideIcon;
}

export interface PromptOptions extends ConfirmOptions {
  label: string;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
  inputType?: 'text' | 'date';
  multiline?: boolean;
  /** Defaults to true: the confirm button stays disabled until something is entered. */
  required?: boolean;
}

export interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

export const DialogContext = createContext<DialogApi | null>(null);

const fallback: DialogApi = {
  confirm: (o) => Promise.resolve(window.confirm(o.title)),
  prompt: (o) => Promise.resolve(window.prompt(o.label, o.defaultValue)),
};

/** `if (await confirm({ title: 'Delete this?', tone: 'danger' })) …` — a styled in-app dialog. */
export function useConfirm() {
  return (useContext(DialogContext) ?? fallback).confirm;
}

/** `const reason = await prompt({ title: 'Reopen payroll', label: 'Reason' })` — null if cancelled. */
export function usePrompt() {
  return (useContext(DialogContext) ?? fallback).prompt;
}
