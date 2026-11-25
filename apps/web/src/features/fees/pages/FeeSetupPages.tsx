import {
  BILLING_FREQUENCIES,
  BILLING_FREQUENCY_LABELS,
  PERMISSIONS,
  formatRupees,
  type BillingFrequency,
  type FeeHeadItem,
  type FeeStructureRow,
} from '@school/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageSpinner,
  Select,
} from '@/components/ui';
import { YearPicker } from '@/features/admin/components/YearPicker';
import { useSectionOptions, useYearSelection } from '@/features/admin/people-api';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import {
  useFeeHeads,
  useFeeStructures,
  useGenerateDues,
  useSaveFeeHead,
  useSaveFeeStructure,
} from '../fees-api';
import { useConfirm } from '@/lib/dialogs';

// --- Fee heads ---------------------------------------------------------------------------------

export function FeeHeadsPage() {
  const { can } = useAuth();
  const manage = can(PERMISSIONS.FEES_CONFIGURE);
  const heads = useFeeHeads();
  const [editing, setEditing] = useState<FeeHeadItem | 'new' | null>(null);
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Fee heads"
        description="The kinds of fees the school charges, e.g. tuition, annual charges, examination, transport."
        actions={manage && <Button onClick={() => setEditing('new')}>New fee head</Button>}
      />
      <Card>
        {heads.isLoading ? (
          <PageSpinner />
        ) : !heads.data?.length ? (
          <EmptyState
            title="No fee heads yet"
            description="Add tuition, annual charges, examination fee and so on."
          />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {heads.data.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-3 font-mono text-xs">{h.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{h.name}</div>
                    {h.description && <div className="text-xs text-ink-muted">{h.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={h.isActive ? 'green' : 'gray'}>
                      {h.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {manage && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(h)}>
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editing && (
        <FeeHeadModal head={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function FeeHeadModal({ head, onClose }: { head: FeeHeadItem | null; onClose: () => void }) {
  const save = useSaveFeeHead();
  const [form, setForm] = useState({
    code: head?.code ?? '',
    name: head?.name ?? '',
    description: head?.description ?? '',
    isActive: head?.isActive ?? true,
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setErrs({});
    setError(null);
    try {
      await save.mutateAsync({ id: head?.id, ...form, ...(head ? {} : { isActive: undefined }) });
      onClose();
    } catch (e) {
      const r = splitFieldErrors(e);
      setErrs(r.fields);
      setError(r.general[0] ?? null);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={head ? `Edit ${head.name}` : 'New fee head'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Field label="Code" htmlFor="fh-code" error={errs.code} required>
            <Input
              id="fh-code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="TUITION"
            />
          </Field>
          <Field label="Name" htmlFor="fh-name" error={errs.name} required>
            <Input
              id="fh-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Tuition fee"
            />
          </Field>
        </div>
        <Field label="Description" htmlFor="fh-desc">
          <Input
            id="fh-desc"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
        {head && (
          <Checkbox
            label="Active (inactive heads cannot be used in new plans or charges)"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
        )}
      </div>
    </Modal>
  );
}

// --- Fee plans ---------------------------------------------------------------------------------

export function FeePlansPage() {
  const confirm = useConfirm();
  const { can } = useAuth();
  const manage = can(PERMISSIONS.FEES_CONFIGURE);
  const { years, yearId, setYearId, year } = useYearSelection();
  const plans = useFeeStructures(yearId);
  const generate = useGenerateDues();
  const [editing, setEditing] = useState<FeeStructureRow | 'new' | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const closed = year?.status === 'CLOSED';

  const onGenerate = async (p: FeeStructureRow) => {
    if (
      !(await confirm({
        title: `Bill every current student of ${p.class.name} with "${p.name}" (${formatRupees(p.total)} each)?`,
        message: `Students already billed are skipped.`,
        confirmLabel: 'Generate dues',
      }))
    )
      return;
    setMessage(null);
    try {
      const r = await generate.mutateAsync({ structureId: p.id });
      setMessage({
        tone: 'success',
        text: r.duesCreated
          ? `${r.duesCreated} dues created for ${p.class.name}${r.skipped ? ` (${r.skipped} already existed)` : ''}.`
          : `Everyone in ${p.class.name} was already billed — nothing new to add.`,
      });
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessages(e)[0] });
    }
  };

  return (
    <div>
      <PageHeader
        title="Fee plans"
        description="What each class pays in a year, with instalment due dates. Generating dues bills every current student of the class."
        actions={
          <>
            <YearPicker yearId={yearId} onChange={setYearId} years={years.data} />
            {manage && !closed && <Button onClick={() => setEditing('new')}>New fee plan</Button>}
          </>
        }
      />
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      {plans.isLoading ? (
        <PageSpinner />
      ) : !plans.data?.length ? (
        <EmptyState
          title="No fee plans for this year"
          description="Create one plan per class (you can copy amounts between classes)."
        />
      ) : (
        <div className="space-y-4">
          {plans.data.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-brand-navy">
                    {p.class.name} · {p.name} {!p.isActive && <Badge tone="gray">inactive</Badge>}
                  </h2>
                  <p className="text-xs text-ink-muted">
                    {BILLING_FREQUENCY_LABELS[p.billingFrequency]} · {formatRupees(p.total)} per
                    student ·{' '}
                    {p.studentsBilled ? `${p.studentsBilled} student(s) billed` : 'not billed yet'}
                  </p>
                </div>
                {manage && !closed && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onGenerate(p)}
                      disabled={!p.isActive}
                      loading={
                        generate.isPending &&
                        generate.variables &&
                        'structureId' in generate.variables &&
                        generate.variables.structureId === p.id
                      }
                    >
                      Generate dues
                    </Button>
                  </div>
                )}
              </div>
              <table className="mt-3 w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {p.items.map((i) => (
                    <tr key={i.id}>
                      <td className="py-1.5 text-ink">
                        {i.feeHead.name}
                        {i.installmentLabel && (
                          <span className="text-ink-muted"> — {i.installmentLabel}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-ink-muted">
                        {i.dueDate ? `due ${formatDate(i.dueDate)}` : 'no due date'}
                      </td>
                      <td className="py-1.5 text-right font-medium">{formatRupees(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <FeePlanModal
          yearId={yearId}
          plan={editing === 'new' ? null : editing}
          plans={plans.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

interface ItemDraft {
  feeHeadId: string;
  amount: string;
  dueDate: string;
  installmentLabel: string;
}

function FeePlanModal({
  yearId,
  plan,
  plans,
  onClose,
}: {
  yearId: string;
  plan: FeeStructureRow | null;
  plans: FeeStructureRow[];
  onClose: () => void;
}) {
  const heads = useFeeHeads();
  const sections = useSectionOptions(yearId);
  const save = useSaveFeeStructure();
  const classes = [...new Map((sections.data ?? []).map((c) => [c.class.id, c.class])).values()];
  const locked = !!plan && plan.studentsBilled > 0;
  const toDraft = (p: FeeStructureRow): ItemDraft[] =>
    p.items.map((i) => ({
      feeHeadId: i.feeHead.id,
      amount: String(i.amount),
      dueDate: i.dueDate ?? '',
      installmentLabel: i.installmentLabel ?? '',
    }));
  const [form, setForm] = useState({
    classId: plan?.class.id ?? '',
    name: plan?.name ?? '',
    billingFrequency: (plan?.billingFrequency ?? 'QUARTERLY') as BillingFrequency,
    isActive: plan?.isActive ?? true,
  });
  const [items, setItems] = useState<ItemDraft[]>(
    plan ? toDraft(plan) : [{ feeHeadId: '', amount: '', dueDate: '', installmentLabel: '' }],
  );
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const activeHeads = (heads.data ?? []).filter((h) => h.isActive);
  const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const setItem = (idx: number, patch: Partial<ItemDraft>) =>
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const submit = async () => {
    setErrs({});
    setError(null);
    const payloadItems = items.map((i) => ({
      feeHeadId: i.feeHeadId,
      amount: i.amount,
      dueDate: i.dueDate,
      installmentLabel: i.installmentLabel,
    }));
    try {
      if (plan) {
        await save.mutateAsync({
          id: plan.id,
          name: form.name,
          billingFrequency: form.billingFrequency,
          isActive: form.isActive,
          ...(locked ? {} : { items: payloadItems as never }),
        });
      } else {
        await save.mutateAsync({
          academicYearId: yearId,
          classId: form.classId,
          name: form.name,
          billingFrequency: form.billingFrequency,
          items: payloadItems as never,
        });
      }
      onClose();
    } catch (e) {
      const r = splitFieldErrors(e);
      setErrs(r.fields);
      setError(
        r.general[0] ?? Object.entries(r.fields).find(([k]) => k.startsWith('items'))?.[1] ?? null,
      );
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={plan ? `Edit ${plan.class.name} · ${plan.name}` : 'New fee plan'}
      footer={
        <>
          <span className="mr-auto text-sm text-ink-muted">
            Total per student: {formatRupees(total)}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {locked && (
          <Alert tone="info">
            {plan!.studentsBilled} student(s) have already been billed from this plan, so its fees
            are fixed. You can still rename or deactivate it, or add one-off charges to individual
            students.
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Class" htmlFor="fp-class" error={errs.classId} required>
            <Select
              id="fp-class"
              value={form.classId}
              onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value }))}
              disabled={!!plan}
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Plan name" htmlFor="fp-name" error={errs.name} required>
            <Input
              id="fp-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Annual fees"
            />
          </Field>
          <Field label="Billing" htmlFor="fp-freq">
            <Select
              id="fp-freq"
              value={form.billingFrequency}
              onChange={(e) =>
                setForm((f) => ({ ...f, billingFrequency: e.target.value as BillingFrequency }))
              }
            >
              {BILLING_FREQUENCIES.map((b) => (
                <option key={b} value={b}>
                  {BILLING_FREQUENCY_LABELS[b]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!plan && plans.length > 0 && (
          <Field label="Copy fees from another plan (optional)" htmlFor="fp-copy">
            <Select
              id="fp-copy"
              value=""
              onChange={(e) => {
                const p = plans.find((x) => x.id === e.target.value);
                if (p) setItems(toDraft(p));
              }}
            >
              <option value="">—</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.class.name} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-brand-navy">Fees in this plan</h3>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="grid items-end gap-2 sm:grid-cols-[1.3fr_1fr_110px_150px_auto]"
              >
                <Field label={idx === 0 ? 'Fee head' : ''} htmlFor={`fp-h-${idx}`}>
                  <Select
                    id={`fp-h-${idx}`}
                    value={it.feeHeadId}
                    onChange={(e) => setItem(idx, { feeHeadId: e.target.value })}
                    disabled={locked}
                    aria-label={`Fee head ${idx + 1}`}
                  >
                    <option value="">Select</option>
                    {activeHeads.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={idx === 0 ? 'Instalment label' : ''} htmlFor={`fp-l-${idx}`}>
                  <Input
                    id={`fp-l-${idx}`}
                    value={it.installmentLabel}
                    onChange={(e) => setItem(idx, { installmentLabel: e.target.value })}
                    placeholder="Q1 (Apr–Jun)"
                    disabled={locked}
                    aria-label={`Instalment label ${idx + 1}`}
                  />
                </Field>
                <Field label={idx === 0 ? 'Amount (₹)' : ''} htmlFor={`fp-a-${idx}`}>
                  <Input
                    id={`fp-a-${idx}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={it.amount}
                    onChange={(e) => setItem(idx, { amount: e.target.value })}
                    disabled={locked}
                    aria-label={`Amount ${idx + 1}`}
                  />
                </Field>
                <Field label={idx === 0 ? 'Due date' : ''} htmlFor={`fp-d-${idx}`}>
                  <Input
                    id={`fp-d-${idx}`}
                    type="date"
                    value={it.dueDate}
                    onChange={(e) => setItem(idx, { dueDate: e.target.value })}
                    disabled={locked}
                    aria-label={`Due date ${idx + 1}`}
                  />
                </Field>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setItems((l) => l.filter((_, i) => i !== idx))}
                  disabled={locked || items.length === 1}
                  aria-label={`Remove fee ${idx + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          {!locked && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() =>
                setItems((l) => [
                  ...l,
                  { feeHeadId: '', amount: '', dueDate: '', installmentLabel: '' },
                ])
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add fee
            </Button>
          )}
          {!activeHeads.length && (
            <p className="mt-2 text-xs text-ink-muted">
              Create fee heads first (Fees → Fee heads).
            </p>
          )}
        </div>
        {plan && (
          <Checkbox
            label="Active (inactive plans cannot generate dues)"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
        )}
      </div>
    </Modal>
  );
}
