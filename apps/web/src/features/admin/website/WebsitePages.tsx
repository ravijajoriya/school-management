import {
  PAGE_CONTENT_SCHEMAS,
  PAGE_KEYS,
  PAGE_LABELS,
  SITE_ICONS,
  pageKeySchema,
  type PageKey,
  type SiteIcon,
} from '@school/shared';
import { ArrowDown, ArrowUp, ExternalLink, ImageIcon, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { SiteIconView } from '@/components/common/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  PageSpinner,
  Select,
} from '@/components/ui';
import { errorMessages } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { mediaUrl } from '@/lib/public-api';
import { usePublishPage, useSavePage, useWebsitePage, useWebsitePages } from '../cms-api';
import { MediaPicker } from '../cms/MediaPicker';
import { PAGE_DESCRIPTIONS, PAGE_FIELDS, PAGE_PUBLIC_PATHS, type FieldDef } from './page-fields';

type Json = Record<string, unknown>;

// --- Page list ----------------------------------------------------------------------------

export function WebsitePagesPage() {
  const pages = useWebsitePages();
  if (pages.isLoading) return <PageSpinner />;
  if (pages.isError) return <Alert>{errorMessages(pages.error)[0]}</Alert>;
  const byKey = new Map(pages.data?.map((p) => [p.pageKey, p]));
  return (
    <div>
      <PageHeader
        title="Website"
        description="Edit the public website. Changes are saved as a draft and go live only when you publish."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PAGE_KEYS.map((key) => {
          const page = byKey.get(key);
          return (
            <Link key={key} to={`/admin/website/${key}`}>
              <Card className="h-full p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-brand-navy">{PAGE_LABELS[key]}</h2>
                  {page &&
                    (page.hasUnpublishedChanges ? (
                      <Badge tone="amber">Unpublished changes</Badge>
                    ) : (
                      <Badge tone="green">Live</Badge>
                    ))}
                </div>
                <p className="mt-2 text-sm text-ink-muted">{PAGE_DESCRIPTIONS[key]}</p>
                {page && (
                  <p className="mt-3 text-xs text-ink-muted">
                    Last edited {formatDateTime(page.updatedAt)}
                    {page.updatedBy ? ` by ${page.updatedBy.fullName}` : ''}
                  </p>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// --- Page editor ----------------------------------------------------------------------------

export function PageEditorPage() {
  const parsed = pageKeySchema.safeParse(useParams().key);
  if (!parsed.success) return <Alert>Unknown page.</Alert>;
  return <PageEditor key={parsed.data} pageKey={parsed.data} />;
}

function PageEditor({ pageKey }: { pageKey: PageKey }) {
  const page = useWebsitePage(pageKey);
  if (page.isLoading) return <PageSpinner />;
  if (page.isError || !page.data) return <Alert>{errorMessages(page.error)[0]}</Alert>;
  return (
    <EditorForm
      pageKey={pageKey}
      initial={page.data.content as unknown as Json}
      hasUnpublished={page.data.hasUnpublishedChanges}
      publishedAt={page.data.publishedAt}
    />
  );
}

function EditorForm({
  pageKey,
  initial,
  hasUnpublished,
  publishedAt,
}: {
  pageKey: PageKey;
  initial: Json;
  hasUnpublished: boolean;
  publishedAt: string | null;
}) {
  const [value, setValue] = useState<Json>(initial);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const save = useSavePage();
  const publish = usePublishPage();

  // Warn before leaving with unsaved edits.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  const update = (path: (string | number)[], v: unknown) => {
    setValue((prev) => setIn(prev, path, v) as Json);
    setDirty(true);
  };

  const validate = (): boolean => {
    const result = PAGE_CONTENT_SCHEMAS[pageKey].safeParse(value);
    if (result.success) {
      setErrors({});
      return true;
    }
    setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message])));
    setMessage({ tone: 'error', text: 'Please fix the highlighted fields.' });
    return false;
  };

  const doSave = async () => {
    setMessage(null);
    if (!validate()) return false;
    try {
      await save.mutateAsync({ key: pageKey, content: value });
      setDirty(false);
      return true;
    } catch (error) {
      const msgs = errorMessages(error);
      setErrors(
        Object.fromEntries(
          msgs
            .map((m) => /^content\.([\w.]+): (.+)$/.exec(m))
            .filter(Boolean)
            .map((m) => [m![1], m![2]]),
        ),
      );
      setMessage({ tone: 'error', text: msgs[0] });
      return false;
    }
  };

  const onSave = async () => {
    if (await doSave())
      setMessage({
        tone: 'success',
        text: 'Draft saved. Publish when you are ready to make it live.',
      });
  };

  const onPublish = async () => {
    if (dirty && !(await doSave())) return;
    try {
      await publish.mutateAsync(pageKey);
      setMessage({ tone: 'success', text: 'Published! The website now shows these changes.' });
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessages(error)[0] });
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={PAGE_LABELS[pageKey]}
        description={PAGE_DESCRIPTIONS[pageKey]}
        actions={
          <a
            href={PAGE_PUBLIC_PATHS[pageKey]}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-navy hover:underline"
          >
            View live page <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        }
      />
      <div className="sticky top-0 z-10 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span className="text-sm text-ink-muted">
          {dirty ? (
            <Badge tone="amber">Unsaved edits</Badge>
          ) : hasUnpublished || save.isSuccess ? (
            <Badge tone="amber">Draft differs from live site</Badge>
          ) : (
            <Badge tone="green">Live</Badge>
          )}{' '}
          {publishedAt &&
            `Last published ${formatDateTime(publish.data?.publishedAt ?? publishedAt)}`}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onSave} loading={save.isPending} disabled={!dirty}>
            Save draft
          </Button>
          <Button onClick={onPublish} loading={publish.isPending}>
            Publish
          </Button>
        </div>
      </div>
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      <Card className="space-y-6 p-6">
        <Fields
          fields={PAGE_FIELDS[pageKey]}
          value={value}
          path={[]}
          errors={errors}
          onChange={update}
        />
      </Card>
      {blocker.state === 'blocked' && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit">
          <Alert tone="warning">
            <span className="mr-3">You have unsaved edits. Leave anyway?</span>
            <Button size="sm" variant="danger" onClick={() => blocker.proceed()}>
              Leave
            </Button>{' '}
            <Button size="sm" variant="secondary" onClick={() => blocker.reset()}>
              Stay
            </Button>
          </Alert>
        </div>
      )}
    </div>
  );
}

// --- Generic field rendering ------------------------------------------------------------------

function setIn(obj: unknown, path: (string | number)[], v: unknown): unknown {
  if (!path.length) return v;
  const [head, ...rest] = path;
  if (Array.isArray(obj)) {
    const copy = [...obj];
    copy[head as number] = setIn(copy[head as number], rest, v);
    return copy;
  }
  const o = (obj ?? {}) as Json;
  return { ...o, [head]: setIn(o[head as string], rest, v) };
}

interface FieldsProps {
  fields: FieldDef[];
  value: Json;
  path: (string | number)[];
  errors: Record<string, string>;
  onChange: (path: (string | number)[], v: unknown) => void;
}

function Fields({ fields, value, path, errors, onChange }: FieldsProps) {
  return (
    <>
      {fields.map((f) => (
        <FieldView
          key={f.key}
          def={f}
          value={value?.[f.key]}
          path={[...path, f.key]}
          errors={errors}
          onChange={onChange}
        />
      ))}
    </>
  );
}

function FieldView({
  def,
  value,
  path,
  errors,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  path: (string | number)[];
  errors: Record<string, string>;
  onChange: FieldsProps['onChange'];
}) {
  const id = path.join('.');
  const error = errors[id];
  switch (def.kind) {
    case 'text':
      return (
        <Field label={def.label} htmlFor={id} error={error} hint={def.hint}>
          {def.rows ? (
            <textarea
              id={id}
              rows={def.rows}
              value={(value as string) ?? ''}
              placeholder={def.placeholder}
              onChange={(e) => onChange(path, e.target.value)}
              className={`block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${error ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:border-brand-navy focus:ring-brand-gold/40'}`}
            />
          ) : (
            <Input
              id={id}
              value={(value as string) ?? ''}
              placeholder={def.placeholder}
              invalid={!!error}
              onChange={(e) => onChange(path, e.target.value)}
            />
          )}
        </Field>
      );
    case 'image':
      return (
        <ImageField
          label={def.label}
          hint={def.hint}
          value={(value as string | null) ?? null}
          error={error}
          onChange={(v) => onChange(path, v)}
        />
      );
    case 'icon':
      return (
        <Field label={def.label} htmlFor={id} error={error}>
          <div className="flex items-center gap-3">
            <SiteIconView
              icon={(value as SiteIcon) ?? 'star'}
              className="h-6 w-6 text-brand-gold"
            />
            <Select
              id={id}
              value={(value as string) ?? 'star'}
              onChange={(e) => onChange(path, e.target.value)}
              className="max-w-[220px]"
            >
              {SITE_ICONS.map((i) => (
                <option key={i} value={i}>
                  {i.replace('-', ' ')}
                </option>
              ))}
            </Select>
          </div>
        </Field>
      );
    case 'group':
      return (
        <fieldset className="space-y-4 rounded-lg border border-gray-200 p-4">
          <legend className="px-1 text-sm font-semibold text-brand-navy">{def.label}</legend>
          <Fields
            fields={def.fields}
            value={(value as Json) ?? {}}
            path={path}
            errors={errors}
            onChange={onChange}
          />
        </fieldset>
      );
    case 'stringList': {
      const items = (value as string[]) ?? [];
      return (
        <ListShell
          label={def.label}
          error={error}
          canAdd={items.length < def.max}
          addLabel={`Add ${def.itemLabel.toLowerCase()}`}
          onAdd={() => onChange(path, [...items, ''])}
        >
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                aria-label={`${def.itemLabel} ${i + 1}`}
                value={item}
                invalid={!!errors[`${id}.${i}`]}
                onChange={(e) => onChange([...path, i], e.target.value)}
              />
              <ItemButtons
                index={i}
                count={items.length}
                onMove={(to) => onChange(path, move(items, i, to))}
                onRemove={() =>
                  onChange(
                    path,
                    items.filter((_, j) => j !== i),
                  )
                }
                label={def.itemLabel}
              />
            </div>
          ))}
        </ListShell>
      );
    }
    case 'list': {
      const items = (value as Json[]) ?? [];
      return (
        <ListShell
          label={def.label}
          error={error}
          canAdd={items.length < def.max}
          addLabel={`Add ${def.itemLabel.toLowerCase()}`}
          onAdd={() => onChange(path, [...items, def.newItem()])}
        >
          {items.map((item, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-surface/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">
                  {def.itemLabel} {i + 1}
                </span>
                <ItemButtons
                  index={i}
                  count={items.length}
                  onMove={(to) => onChange(path, move(items, i, to))}
                  onRemove={() =>
                    onChange(
                      path,
                      items.filter((_, j) => j !== i),
                    )
                  }
                  label={def.itemLabel}
                />
              </div>
              <div className="space-y-4">
                <Fields
                  fields={def.fields}
                  value={item}
                  path={[...path, i]}
                  errors={errors}
                  onChange={onChange}
                />
              </div>
            </div>
          ))}
        </ListShell>
      );
    }
  }
}

function move<T>(items: T[], from: number, to: number): T[] {
  const copy = [...items];
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
}

function ListShell({
  label,
  error,
  canAdd,
  addLabel,
  onAdd,
  children,
}: {
  label: string;
  error?: string;
  canAdd: boolean;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-brand-navy">{label}</legend>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {children}
      {canAdd && (
        <Button size="sm" variant="secondary" onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {addLabel}
        </Button>
      )}
    </fieldset>
  );
}

function ItemButtons({
  index,
  count,
  onMove,
  onRemove,
  label,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  label: string;
}) {
  const btn = 'rounded p-1.5 text-ink-muted hover:bg-gray-100 disabled:opacity-30';
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        className={btn}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        aria-label={`Move ${label} ${index + 1} up`}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        aria-label={`Move ${label} ${index + 1} down`}
      >
        <ArrowDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`${btn} hover:text-red-600`}
        onClick={onRemove}
        aria-label={`Remove ${label} ${index + 1}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function ImageField({
  label,
  hint,
  value,
  error,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | null;
  error?: string;
  onChange: (v: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <Field label={label} error={error} hint={hint}>
      <div className="flex items-center gap-4">
        {value ? (
          <img
            src={mediaUrl(value)}
            alt=""
            className="h-20 w-28 rounded-md border border-gray-200 object-cover"
          />
        ) : (
          <div className="flex h-20 w-28 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-400">
            <ImageIcon className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
            {value ? 'Change' : 'Choose image'}
          </Button>
          {value && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {picking && (
        <MediaPicker
          open
          onClose={() => setPicking(false)}
          onSelect={(m) => {
            onChange(m.id);
            setPicking(false);
          }}
        />
      )}
    </Field>
  );
}
