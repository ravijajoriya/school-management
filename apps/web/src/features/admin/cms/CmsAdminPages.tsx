import {
  ANNOUNCEMENT_STATUSES,
  EVENT_STATUSES,
  MEDIA_CATEGORIES,
  MEDIA_CATEGORY_LABELS,
  type AnnouncementItem,
  type AnnouncementStatus,
  type EventItem,
  type EventStatus,
  type MediaCategory,
  type MediaItem,
  type NoticeItem,
} from '@school/shared';
import { EyeOff, Pencil, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
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
  Pagination,
  Select,
} from '@/components/ui';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import { formatBytes, formatDateTime, fromLocalInput, toLocalInput } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useRoles } from '../api';
import {
  useAnnouncements,
  useDeleteAnnouncement,
  useDeleteEvent,
  useDeleteMedia,
  useDeleteNotice,
  useEvents,
  useMedia,
  useNotices,
  useSaveAnnouncement,
  useSaveEvent,
  useSaveNotice,
  useUpdateMedia,
  useUploadMedia,
} from '../cms-api';
import { usePagination } from '@/lib/use-pagination';
import { useConfirm } from '@/lib/dialogs';

const textarea =
  'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-gold/40';

const STATUS_TONE = {
  DRAFT: 'gray',
  PUBLISHED: 'green',
  ARCHIVED: 'gray',
  CANCELLED: 'red',
} as const;

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 text-right">
      <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete">
        <Trash2 className="h-4 w-4" />
      </Button>
    </td>
  );
}

/** Shared state for "field: message" server errors in the small editors below. */
function useServerErrors() {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  return {
    fields,
    general,
    reset: () => {
      setFields({});
      setGeneral(null);
    },
    capture: (error: unknown) => {
      const r = splitFieldErrors(error);
      setFields(r.fields);
      setGeneral(r.general[0] ?? null);
    },
  };
}

// --- Announcements ----------------------------------------------------------------------------

export function AnnouncementsAdminPage() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<AnnouncementStatus | ''>('');
  const [search, setSearch] = useState('');
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const debounced = useDebouncedValue(search);
  const list = useAnnouncements({ status: status || undefined, search: debounced, page, pageSize });
  const remove = useDeleteAnnouncement();
  const [editing, setEditing] = useState<AnnouncementItem | 'new' | null>(null);

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Public notices shown on the home page and the Announcements page."
        actions={<Button onClick={() => setEditing('new')}>New announcement</Button>}
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-gray-200 p-4">
          <Input
            type="search"
            placeholder="Search titles"
            className="max-w-xs"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search announcements"
          />
          <Select
            className="max-w-[180px]"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AnnouncementStatus | '');
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {ANNOUNCEMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
        {list.isLoading ? (
          <PageSpinner />
        ) : !list.data?.items.length ? (
          <EmptyState
            title="No announcements"
            description="Create one to show it on the website."
          />
        ) : (
          <Table head={['Title', 'Status', 'Visible from', 'Until', 'Created']}>
            {list.data.items.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium text-ink">{a.title}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[a.status]}>{a.status.toLowerCase()}</Badge>{' '}
                  {a.isLive && <Badge tone="gold">On website</Badge>}
                </td>
                <td className="px-4 py-3 text-ink-muted">{formatDateTime(a.publishAt)}</td>
                <td className="px-4 py-3 text-ink-muted">
                  {a.expiresAt ? formatDateTime(a.expiresAt) : 'No expiry'}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {formatDateTime(a.createdAt)} · {a.createdBy.fullName}
                </td>
                <RowActions
                  onEdit={() => setEditing(a)}
                  onDelete={async () => {
                    if (
                      await confirm({
                        title: `Delete "${a.title}"?`,
                        confirmLabel: 'Delete',
                        tone: 'danger',
                      })
                    )
                      void remove.mutate(a.id);
                  }}
                />
              </tr>
            ))}
          </Table>
        )}
        {list.data && list.data.total > 0 && (
          <Pagination
            page={list.data.page}
            totalPages={list.data.totalPages}
            total={list.data.total}
            onChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        )}
      </Card>
      {editing && (
        <AnnouncementEditor
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AnnouncementEditor({
  item,
  onClose,
}: {
  item: AnnouncementItem | null;
  onClose: () => void;
}) {
  const save = useSaveAnnouncement();
  const errs = useServerErrors();
  const [form, setForm] = useState({
    title: item?.title ?? '',
    body: item?.body ?? '',
    status: item?.status ?? ('DRAFT' as AnnouncementStatus),
    publishAt: toLocalInput(item?.publishAt),
    expiresAt: toLocalInput(item?.expiresAt),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    errs.reset();
    try {
      await save.mutateAsync({
        id: item?.id,
        title: form.title,
        body: form.body,
        status: form.status,
        publishAt: fromLocalInput(form.publishAt),
        expiresAt: fromLocalInput(form.expiresAt),
      });
      onClose();
    } catch (error) {
      errs.capture(error);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Edit announcement' : 'New announcement'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errs.general && <Alert>{errs.general}</Alert>}
        <Field label="Title" htmlFor="a-title" error={errs.fields.title} required>
          <Input
            id="a-title"
            value={form.title}
            onChange={set('title')}
            invalid={!!errs.fields.title}
          />
        </Field>
        <Field
          label="Text"
          htmlFor="a-body"
          error={errs.fields.body}
          required
          hint="Plain text. Line breaks are kept."
        >
          <textarea
            id="a-body"
            rows={6}
            className={textarea}
            value={form.body}
            onChange={set('body')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status" htmlFor="a-status">
            <Select id="a-status" value={form.status} onChange={set('status')}>
              {ANNOUNCEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Show from"
            htmlFor="a-from"
            error={errs.fields.publishAt}
            hint="Empty = immediately"
          >
            <Input
              id="a-from"
              type="datetime-local"
              value={form.publishAt}
              onChange={set('publishAt')}
            />
          </Field>
          <Field
            label="Hide after"
            htmlFor="a-to"
            error={errs.fields.expiresAt}
            hint="Empty = never"
          >
            <Input
              id="a-to"
              type="datetime-local"
              value={form.expiresAt}
              onChange={set('expiresAt')}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

// --- Events -------------------------------------------------------------------------------------

export function EventsAdminPage() {
  const confirm = useConfirm();
  const [when, setWhen] = useState<'upcoming' | 'past' | ''>('upcoming');
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const list = useEvents({ when: when || undefined, page, pageSize });
  const remove = useDeleteEvent();
  const [editing, setEditing] = useState<EventItem | 'new' | null>(null);
  return (
    <div>
      <PageHeader
        title="Events"
        description="School events shown on the home page and the Events page."
        actions={<Button onClick={() => setEditing('new')}>New event</Button>}
      />
      <Card>
        <div className="flex gap-3 border-b border-gray-200 p-4">
          <Select
            className="max-w-[180px]"
            value={when}
            onChange={(e) => {
              setWhen(e.target.value as typeof when);
              setPage(1);
            }}
            aria-label="Filter by time"
          >
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="">All</option>
          </Select>
        </div>
        {list.isLoading ? (
          <PageSpinner />
        ) : !list.data?.items.length ? (
          <EmptyState title="No events" />
        ) : (
          <Table head={['Event', 'When', 'Venue', 'Status']}>
            {list.data.items.map((ev) => (
              <tr key={ev.id}>
                <td className="px-4 py-3 font-medium text-ink">{ev.title}</td>
                <td className="px-4 py-3 text-ink-muted">{formatDateTime(ev.startsAt)}</td>
                <td className="px-4 py-3 text-ink-muted">{ev.venue ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[ev.status]}>{ev.status.toLowerCase()}</Badge>
                </td>
                <RowActions
                  onEdit={() => setEditing(ev)}
                  onDelete={async () => {
                    if (
                      await confirm({
                        title: `Delete "${ev.title}"?`,
                        confirmLabel: 'Delete',
                        tone: 'danger',
                      })
                    )
                      void remove.mutate(ev.id);
                  }}
                />
              </tr>
            ))}
          </Table>
        )}
        {list.data && list.data.total > 0 && (
          <Pagination
            page={list.data.page}
            totalPages={list.data.totalPages}
            total={list.data.total}
            onChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        )}
      </Card>
      {editing && (
        <EventEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function EventEditor({ item, onClose }: { item: EventItem | null; onClose: () => void }) {
  const save = useSaveEvent();
  const errs = useServerErrors();
  const [form, setForm] = useState({
    title: item?.title ?? '',
    description: item?.description ?? '',
    venue: item?.venue ?? '',
    startsAt: toLocalInput(item?.startsAt),
    endsAt: toLocalInput(item?.endsAt),
    status: item?.status ?? ('DRAFT' as EventStatus),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    errs.reset();
    try {
      await save.mutateAsync({
        id: item?.id,
        title: form.title,
        description: form.description || null,
        venue: form.venue || null,
        startsAt: fromLocalInput(form.startsAt) ?? '',
        endsAt: fromLocalInput(form.endsAt),
        status: form.status,
      });
      onClose();
    } catch (error) {
      errs.capture(error);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Edit event' : 'New event'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errs.general && <Alert>{errs.general}</Alert>}
        <Field label="Title" htmlFor="e-title" error={errs.fields.title} required>
          <Input
            id="e-title"
            value={form.title}
            onChange={set('title')}
            invalid={!!errs.fields.title}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" htmlFor="e-start" error={errs.fields.startsAt} required>
            <Input
              id="e-start"
              type="datetime-local"
              value={form.startsAt}
              onChange={set('startsAt')}
              invalid={!!errs.fields.startsAt}
            />
          </Field>
          <Field label="Ends" htmlFor="e-end" error={errs.fields.endsAt}>
            <Input id="e-end" type="datetime-local" value={form.endsAt} onChange={set('endsAt')} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Venue" htmlFor="e-venue">
            <Input
              id="e-venue"
              value={form.venue}
              onChange={set('venue')}
              placeholder="School Auditorium"
            />
          </Field>
          <Field
            label="Status"
            htmlFor="e-status"
            hint="Only published and cancelled events appear on the website."
          >
            <Select id="e-status" value={form.status} onChange={set('status')}>
              {EVENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description" htmlFor="e-desc">
          <textarea
            id="e-desc"
            rows={5}
            className={textarea}
            value={form.description}
            onChange={set('description')}
          />
        </Field>
      </form>
    </Modal>
  );
}

// --- Internal notices ------------------------------------------------------------------------------

export function NoticesAdminPage() {
  const confirm = useConfirm();
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const list = useNotices(page, pageSize);
  const remove = useDeleteNotice();
  const [editing, setEditing] = useState<NoticeItem | 'new' | null>(null);
  return (
    <div>
      <PageHeader
        title="Staff Notices"
        description="Private notices shown on staff dashboards — never on the public website."
        actions={<Button onClick={() => setEditing('new')}>New notice</Button>}
      />
      <Card>
        {list.isLoading ? (
          <PageSpinner />
        ) : !list.data?.items.length ? (
          <EmptyState title="No notices" />
        ) : (
          <Table head={['Title', 'For', 'Visible', 'Created']}>
            {list.data.items.map((n) => (
              <tr key={n.id}>
                <td className="px-4 py-3 font-medium text-ink">{n.title}</td>
                <td className="px-4 py-3 text-ink-muted">{n.audienceRoleCode ?? 'All staff'}</td>
                <td className="px-4 py-3">
                  {n.isLive ? (
                    <Badge tone="green">Showing</Badge>
                  ) : (
                    <Badge tone="gray">Not showing</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {formatDateTime(n.createdAt)} · {n.createdBy.fullName}
                </td>
                <RowActions
                  onEdit={() => setEditing(n)}
                  onDelete={async () => {
                    if (
                      await confirm({
                        title: `Delete "${n.title}"?`,
                        confirmLabel: 'Delete',
                        tone: 'danger',
                      })
                    )
                      void remove.mutate(n.id);
                  }}
                />
              </tr>
            ))}
          </Table>
        )}
        {list.data && list.data.total > 0 && (
          <Pagination
            page={list.data.page}
            totalPages={list.data.totalPages}
            total={list.data.total}
            onChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        )}
      </Card>
      {editing && (
        <NoticeEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function NoticeEditor({ item, onClose }: { item: NoticeItem | null; onClose: () => void }) {
  const save = useSaveNotice();
  const roles = useRoles();
  const errs = useServerErrors();
  const [form, setForm] = useState({
    title: item?.title ?? '',
    body: item?.body ?? '',
    audienceRoleCode: item?.audienceRoleCode ?? '',
    publishAt: toLocalInput(item?.publishAt),
    expiresAt: toLocalInput(item?.expiresAt),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    errs.reset();
    try {
      await save.mutateAsync({
        id: item?.id,
        title: form.title,
        body: form.body,
        audienceRoleCode: form.audienceRoleCode || null,
        publishAt: fromLocalInput(form.publishAt),
        expiresAt: fromLocalInput(form.expiresAt),
      });
      onClose();
    } catch (error) {
      errs.capture(error);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Edit notice' : 'New notice'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errs.general && <Alert>{errs.general}</Alert>}
        <Field label="Title" htmlFor="n-title" error={errs.fields.title} required>
          <Input id="n-title" value={form.title} onChange={set('title')} />
        </Field>
        <Field label="Text" htmlFor="n-body" error={errs.fields.body} required>
          <textarea
            id="n-body"
            rows={5}
            className={textarea}
            value={form.body}
            onChange={set('body')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Show to" htmlFor="n-aud" error={errs.fields.audienceRoleCode}>
            <Select id="n-aud" value={form.audienceRoleCode} onChange={set('audienceRoleCode')}>
              <option value="">All staff</option>
              {roles.data?.map((r) => (
                <option key={r.id} value={r.code}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Show from" htmlFor="n-from" hint="Empty = now">
            <Input
              id="n-from"
              type="datetime-local"
              value={form.publishAt}
              onChange={set('publishAt')}
            />
          </Field>
          <Field
            label="Hide after"
            htmlFor="n-to"
            error={errs.fields.expiresAt}
            hint="Empty = never"
          >
            <Input
              id="n-to"
              type="datetime-local"
              value={form.expiresAt}
              onChange={set('expiresAt')}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

// --- Media library -----------------------------------------------------------------------------------

export function MediaLibraryPage() {
  const [category, setCategory] = useState<MediaCategory | ''>('');
  const [uploadCategory, setUploadCategory] = useState<MediaCategory>('CAMPUS');
  const { page, pageSize, setPage, setPageSize, pageSizeOptions } = usePagination({
    key: 'media',
    defaultSize: 24,
    options: [12, 24, 48, 96],
  });
  const media = useMedia({ category: category || undefined, page, pageSize });
  const upload = useUploadMedia();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [editing, setEditing] = useState<MediaItem | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const failed: string[] = [];
    for (const [i, file] of Array.from(files).entries()) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try {
        await upload.mutateAsync({ file, category: uploadCategory, isPublic: true });
      } catch (e) {
        failed.push(`${file.name}: ${errorMessages(e)[0].replace(/^file: /, '')}`);
      }
    }
    setProgress(null);
    setErrors(failed);
  };

  return (
    <div>
      <PageHeader
        title="Media Library"
        description="Photos for the gallery, banners and website pages. JPEG, PNG or WebP, up to 5 MB each."
      />
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Upload into category" htmlFor="up-cat">
            <Select
              id="up-cat"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as MediaCategory)}
              className="max-w-[200px]"
            >
              {MEDIA_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {MEDIA_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Button onClick={() => input.current?.click()} loading={!!progress}>
            <Upload className="h-4 w-4" aria-hidden="true" /> {progress ?? 'Upload photos'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Academic, Sports, Events, Activities and Campus photos appear in the public gallery.
        </p>
        {errors.length > 0 && (
          <div className="mt-3">
            <Alert>
              {errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </Alert>
          </div>
        )}
      </Card>

      <Card>
        <div className="border-b border-gray-200 p-4">
          <Select
            className="max-w-[200px]"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as MediaCategory | '');
              setPage(1);
            }}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {MEDIA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {MEDIA_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
        {media.isLoading ? (
          <PageSpinner />
        ) : !media.data?.items.length ? (
          <EmptyState
            title="No images yet"
            description="Upload photos to use them on the website."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {media.data.items.map((m) => (
              <li key={m.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <button onClick={() => setEditing(m)} className="block w-full text-left">
                  {m.isPublic ? (
                    <img
                      src={m.url}
                      alt={m.altText ?? m.title ?? ''}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-surface text-ink-muted">
                      <EyeOff className="h-6 w-6" aria-hidden="true" />
                      <span className="text-xs">Hidden</span>
                    </div>
                  )}
                  <div className="p-2">
                    <p className="truncate text-xs font-medium text-ink">{m.title ?? 'Untitled'}</p>
                    <p className="text-[11px] text-ink-muted">
                      {MEDIA_CATEGORY_LABELS[m.category]} · {formatBytes(m.fileSizeBytes)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {media.data && media.data.total > 0 && (
          <Pagination
            page={media.data.page}
            totalPages={media.data.totalPages}
            total={media.data.total}
            onChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            pageSizeOptions={pageSizeOptions}
          />
        )}
      </Card>
      {editing && <MediaEditor item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MediaEditor({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const confirm = useConfirm();
  const update = useUpdateMedia();
  const remove = useDeleteMedia();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: item.title ?? '',
    altText: item.altText ?? '',
    category: item.category,
    isPublic: item.isPublic,
  });
  const onSave = async () => {
    setError(null);
    try {
      await update.mutateAsync({
        id: item.id,
        title: form.title || null,
        altText: form.altText || null,
        category: form.category,
        isPublic: form.isPublic,
      });
      onClose();
    } catch (e) {
      setError(errorMessages(e)[0]);
    }
  };
  const onDelete = async () => {
    if (
      !(await confirm({
        title: 'Delete this image permanently?',
        confirmLabel: 'Delete',
        tone: 'danger',
      }))
    )
      return;
    setError(null);
    try {
      await remove.mutateAsync(item.id);
      onClose();
    } catch (e) {
      setError(errorMessages(e)[0]);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Image details"
      footer={
        <>
          <Button
            variant="danger"
            className="mr-auto"
            onClick={onDelete}
            loading={remove.isPending}
          >
            Delete
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} loading={update.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {item.isPublic && (
          <img src={item.url} alt="" className="max-h-56 w-full rounded-md object-contain" />
        )}
        <Field label="Title" htmlFor="m-title">
          <Input
            id="m-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </Field>
        <Field label="Description for screen readers (alt text)" htmlFor="m-alt">
          <Input
            id="m-alt"
            value={form.altText}
            onChange={(e) => setForm((f) => ({ ...f, altText: e.target.value }))}
          />
        </Field>
        <Field label="Category" htmlFor="m-cat">
          <Select
            id="m-cat"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as MediaCategory }))}
          >
            {MEDIA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {MEDIA_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox
          label="Visible on the public website"
          checked={form.isPublic}
          onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
        />
        <p className="text-xs text-ink-muted">
          Uploaded {formatDateTime(item.createdAt)} by {item.uploadedBy.fullName} ·{' '}
          {formatBytes(item.fileSizeBytes)}
        </p>
      </div>
    </Modal>
  );
}
