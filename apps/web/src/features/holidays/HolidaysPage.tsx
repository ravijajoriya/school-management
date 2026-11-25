import { PERMISSIONS, type HolidayItem } from '@school/shared';
import { CalendarHeart, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageSpinner,
} from '@/components/ui';
import { YearPicker } from '@/features/admin/components/YearPicker';
import { useYearSelection } from '@/features/admin/people-api';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import { useConfirm } from '@/lib/dialogs';
import { formatDate, todayIso } from '@/lib/format';
import { useDeleteHoliday, useHolidays, useSaveHoliday } from './holidays-api';

const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' });
const dayName = (d: string) => weekday.format(new Date(`${d}T00:00:00Z`));

/**
 * School holiday calendar (Admin → Academics → Holidays). Teachers see these days faded on their
 * timetable, and attendance can't be marked on them.
 */
export function HolidaysPage() {
  const { can } = useAuth();
  const manage = can(PERMISSIONS.ACADEMICS_MANAGE);
  const { years, yearId, setYearId, year } = useYearSelection();
  const holidays = useHolidays({ academicYearId: yearId }, !!yearId);
  const remove = useDeleteHoliday();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<HolidayItem | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();
  const closed = year?.status === 'CLOSED';
  const totalDays = holidays.data?.reduce((n, h) => n + h.days, 0) ?? 0;

  const onDelete = async (h: HolidayItem) => {
    const ok = await confirm({
      title: `Delete "${h.name}"?`,
      message: 'Teachers will be able to mark attendance on these days again.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    try {
      await remove.mutateAsync(h.id);
    } catch (e) {
      setError(errorMessages(e)[0]);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Holidays"
        icon={CalendarHeart}
        description="School holidays for the year. Teachers see them faded on their timetable, and attendance isn't taken on these days. Sundays are always off."
        actions={
          <>
            <YearPicker yearId={yearId} onChange={setYearId} years={years.data} />
            {manage && !closed && (
              <Button onClick={() => setEditing('new')} disabled={!yearId}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add holiday
              </Button>
            )}
          </>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <Card>
        {holidays.isLoading ? (
          <PageSpinner />
        ) : !holidays.data?.length ? (
          <EmptyState
            icon={CalendarHeart}
            title="No holidays added yet"
            description="Add festival holidays, vacations and other days the school is closed."
          />
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {holidays.data.map((h) => {
                const past = h.endDate < today;
                const now = h.startDate <= today && today <= h.endDate;
                return (
                  <li
                    key={h.id}
                    className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${past ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 flex-col items-center justify-center rounded-xl bg-brand-gold-light text-brand-gold-dark">
                        <span className="text-[10px] font-semibold uppercase leading-none">
                          {new Intl.DateTimeFormat('en-IN', {
                            month: 'short',
                            timeZone: 'UTC',
                          }).format(new Date(`${h.startDate}T00:00:00Z`))}
                        </span>
                        <span className="text-base font-bold leading-tight">
                          {Number(h.startDate.slice(8))}
                        </span>
                      </span>
                      <div>
                        <p className="font-medium text-ink">{h.name}</p>
                        <p className="text-xs text-ink-muted">
                          {h.days === 1
                            ? `${dayName(h.startDate)}, ${formatDate(h.startDate)}`
                            : `${dayName(h.startDate)} ${formatDate(h.startDate)} – ${dayName(h.endDate)} ${formatDate(h.endDate)} · ${h.days} days`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {now && <Badge tone="gold">Today</Badge>}
                      {past && <Badge>Past</Badge>}
                      {manage && !closed && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(h)}
                            aria-label={`Edit ${h.name}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDelete(h)}
                            aria-label={`Delete ${h.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-gray-100 px-4 py-3 text-xs text-ink-muted">
              {holidays.data.length} holiday{holidays.data.length === 1 ? '' : 's'} · {totalDays}{' '}
              day
              {totalDays === 1 ? '' : 's'} in {year?.name}
            </p>
          </>
        )}
      </Card>
      {editing && year && (
        <HolidayModal
          holiday={editing === 'new' ? null : editing}
          yearId={year.id}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function HolidayModal({
  holiday,
  yearId,
  onClose,
}: {
  holiday: HolidayItem | null;
  yearId: string;
  onClose: () => void;
}) {
  const save = useSaveHoliday();
  const [form, setForm] = useState({
    name: holiday?.name ?? '',
    startDate: holiday?.startDate ?? '',
    endDate: holiday?.endDate ?? '',
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setErrs({});
    setError(null);
    try {
      await save.mutateAsync({
        id: holiday?.id,
        academicYearId: yearId,
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
      });
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
      icon={CalendarHeart}
      tone="gold"
      title={holiday ? `Edit ${holiday.name}` : 'Add holiday'}
      description="For a single day, leave the last day empty."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save holiday
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Name" htmlFor="hol-name" error={errs.name} required>
          <Input
            id="hol-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Diwali break"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First day" htmlFor="hol-start" error={errs.startDate} required>
            <Input
              id="hol-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </Field>
          <Field label="Last day" htmlFor="hol-end" error={errs.endDate}>
            <Input
              id="hol-end"
              type="date"
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
