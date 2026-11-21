import {
  CERTIFICATE_PLACEHOLDERS,
  ID_CARD_AUDIENCES,
  PERMISSIONS,
  type CertificateTemplateItem,
  type IdCardPerson,
  type IdCardTemplateItem,
  type StudentListItem,
} from '@school/shared';
import { ArrowLeft, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Alert,
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
import { usePrivateImage, useSectionOptions, useYearSelection } from '@/features/admin/people-api';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages } from '@/lib/api-client';
import { formatDate, formatDateTime, todayIso } from '@/lib/format';
import { StudentFinder, Td, Th } from '../components/OpsParts';
import { tbodyClass, theadClass, useFormErrors } from '../ops-utils';
import {
  useCertificate,
  useCertificates,
  useCertificateTemplates,
  useCreateIdCardBatch,
  useIdCardBatch,
  useIdCardBatches,
  useIdCardTemplates,
  useIssueCertificate,
  useSaveCertificateTemplate,
  useSaveIdCardTemplate,
} from '../operations-api';
import { usePagination } from '@/lib/use-pagination';

// --- Certificates ----------------------------------------------------------------------------

export function CertificatesPage() {
  const { can } = useAuth();
  const templates = useCertificateTemplates();
  const issue = useIssueCertificate();
  const navigate = useNavigate();
  const errs = useFormErrors();
  const [student, setStudent] = useState<StudentListItem | null>(null);
  const [form, setForm] = useState({
    templateId: '',
    conduct: 'good',
    purpose: '',
    issuedOn: todayIso(),
  });
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const issued = useCertificates({ page, pageSize });
  const template = templates.data?.find((t) => t.id === form.templateId);
  const uses = (p: string) => template?.templateHtml.includes(`{{${p}}}`) ?? false;
  const submit = async () => {
    errs.reset();
    try {
      const c = await issue.mutateAsync({
        templateId: form.templateId,
        studentId: student?.id ?? '',
        conduct: uses('conduct') ? form.conduct : undefined,
        purpose: uses('purpose') ? form.purpose : undefined,
        issuedOn: form.issuedOn,
      });
      navigate(`/admin/certificates/${c.id}`);
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Certificates"
        description="Issue Transfer, Bonafide and Character certificates. Each gets a number and its wording is frozen when issued."
        actions={
          can(PERMISSIONS.CERTIFICATES_TEMPLATES) && (
            <Link
              to="/admin/certificates/templates"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-ink hover:bg-gray-50"
            >
              Edit templates
            </Link>
          )
        }
      />
      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Issue a certificate</h2>
        {errs.general && (
          <div className="mb-3">
            <Alert>{errs.general}</Alert>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Certificate" htmlFor="ci-template" error={errs.fields.templateId} required>
            <Select
              id="ci-template"
              value={form.templateId}
              onChange={(e) => setForm({ ...form, templateId: e.target.value })}
            >
              <option value="">Choose…</option>
              {templates.data
                ?.filter((t) => t.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>
          <StudentFinder
            id="ci-student"
            value={student}
            onChange={setStudent}
            error={errs.fields.studentId}
            includeLeft
          />
          {uses('conduct') && (
            <Field label="Conduct" htmlFor="ci-conduct" error={errs.fields.conduct}>
              <Input
                id="ci-conduct"
                value={form.conduct}
                onChange={(e) => setForm({ ...form, conduct: e.target.value })}
              />
            </Field>
          )}
          {uses('purpose') && (
            <Field label="Purpose" htmlFor="ci-purpose" error={errs.fields.purpose} required>
              <Input
                id="ci-purpose"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="passport application"
              />
            </Field>
          )}
          <Field label="Date of issue" htmlFor="ci-date">
            <Input
              id="ci-date"
              type="date"
              value={form.issuedOn}
              onChange={(e) => setForm({ ...form, issuedOn: e.target.value })}
            />
          </Field>
        </div>
        {template?.code === 'TC' && (
          <p className="mt-3 text-xs text-ink-muted">
            A TC needs the student's transfer or withdrawal recorded first, and no fees outstanding.
          </p>
        )}
        <div className="mt-4">
          <Button onClick={submit} loading={issue.isPending}>
            Issue certificate
          </Button>
        </div>
      </Card>
      <Card>
        {issued.isLoading ? (
          <PageSpinner />
        ) : !issued.data?.items.length ? (
          <EmptyState title="No certificates issued yet" />
        ) : (
          <>
            <table className="min-w-full text-sm">
              <thead className={theadClass}>
                <tr>
                  <Th>Number</Th>
                  <Th>Certificate</Th>
                  <Th>Student</Th>
                  <Th>Issued</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {issued.data.items.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-mono text-xs">{c.certificateNumber}</Td>
                    <Td>{c.snapshot.title}</Td>
                    <Td>
                      {c.student.fullName}
                      <div className="text-xs text-ink-muted">{c.student.admissionNumber}</div>
                    </Td>
                    <Td>
                      {formatDate(c.issuedOn)}
                      <div className="text-xs text-ink-muted">{c.issuedBy}</div>
                    </Td>
                    <Td right>
                      <Link
                        to={`/admin/certificates/${c.id}`}
                        className="text-sm font-medium text-brand-navy hover:underline"
                      >
                        View / print
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={issued.data.page}
              totalPages={issued.data.totalPages}
              total={issued.data.total}
              onChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Card>
    </div>
  );
}

export function CertificateViewPage() {
  const { id = '' } = useParams();
  const cert = useCertificate(id);
  if (cert.isLoading) return <PageSpinner />;
  if (!cert.data) return <Alert>{errorMessages(cert.error)[0]}</Alert>;
  const s = cert.data.snapshot;
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          to="/admin/certificates"
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Certificates
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </Button>
      </div>
      <Card className="border-4 border-double border-brand-navy p-10 print:shadow-none">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-brand-navy">{s.school.name}</h1>
          <p className="text-xs text-ink-muted">{s.school.address}</p>
          <p className="text-xs text-ink-muted">
            {[s.school.phone, s.school.email].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="mt-4 flex justify-between text-xs">
          <span>
            No. <strong className="font-mono">{s.certificateNumber}</strong>
          </span>
          <span>Date: {formatDate(s.issuedOn)}</span>
        </div>
        <h2 className="mt-6 text-center text-lg font-bold uppercase tracking-widest text-brand-navy underline">
          {s.title}
        </h2>
        {/* Plain text from the frozen snapshot: rendered as text, never as HTML. */}
        <div className="mt-6 space-y-4 text-justify leading-relaxed">
          {s.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="mt-16 flex justify-between text-sm">
          <span>Prepared by: {s.issuedBy}</span>
          <span className="border-t border-gray-500 px-6 pt-1">Principal</span>
        </div>
      </Card>
    </div>
  );
}

export function CertificateTemplatesPage() {
  const templates = useCertificateTemplates();
  const [editing, setEditing] = useState<CertificateTemplateItem | 'new' | null>(null);
  return (
    <div className="max-w-4xl">
      <Link
        to="/admin/certificates"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Certificates
      </Link>
      <PageHeader
        title="Certificate templates"
        description="The wording of each certificate. Changes apply to certificates issued from now on; issued ones never change."
        actions={<Button onClick={() => setEditing('new')}>New template</Button>}
      />
      <Card>
        {templates.isLoading ? (
          <PageSpinner />
        ) : (
          <table className="min-w-full text-sm">
            <thead className={theadClass}>
              <tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th right>Issued</Th>
                <Th>Last edited</Th>
                <Th />
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {templates.data?.map((t) => (
                <tr key={t.id}>
                  <Td className="font-mono text-xs">{t.code}</Td>
                  <Td>
                    {t.name}
                    {!t.isActive && <span className="text-xs text-ink-muted"> (inactive)</span>}
                  </Td>
                  <Td right>{t.issued}</Td>
                  <Td className="text-xs text-ink-muted">
                    {formatDateTime(t.updatedAt)} · {t.updatedBy}
                  </Td>
                  <Td right>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                      Edit
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editing && (
        <TemplateModal
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TemplateModal({
  template,
  onClose,
}: {
  template: CertificateTemplateItem | null;
  onClose: () => void;
}) {
  const save = useSaveCertificateTemplate();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    code: template?.code ?? '',
    name: template?.name ?? '',
    templateHtml: template?.templateHtml ?? '',
    isActive: template?.isActive ?? true,
  });
  const submit = async () => {
    errs.reset();
    try {
      await save.mutateAsync({ id: template?.id, ...form });
      onClose();
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={template ? `Edit ${template.name}` : 'New certificate template'}
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
        {errs.general && <Alert>{errs.general}</Alert>}
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <Field label="Code" htmlFor="ct-code" error={errs.fields.code} required>
            <Input
              id="ct-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Title" htmlFor="ct-name" error={errs.fields.name} required>
            <Input
              id="ct-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
        </div>
        <Field
          label="Wording"
          htmlFor="ct-text"
          error={errs.fields.templateHtml}
          hint="Plain text. Leave a blank line between paragraphs."
        >
          <textarea
            id="ct-text"
            rows={12}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
            value={form.templateHtml}
            onChange={(e) => setForm({ ...form, templateHtml: e.target.value })}
          />
        </Field>
        <details className="text-xs text-ink-muted">
          <summary className="cursor-pointer font-medium text-ink">
            Placeholders you can use
          </summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {Object.entries(CERTIFICATE_PLACEHOLDERS).map(([k, v]) => (
              <li key={k}>
                <code>{`{{${k}}}`}</code> — {v}
              </li>
            ))}
          </ul>
        </details>
        {template && (
          <Checkbox
            label="Active"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
        )}
      </div>
    </Modal>
  );
}

// --- ID cards --------------------------------------------------------------------------------

export function IdCardsPage() {
  const templates = useIdCardTemplates();
  const batches = useIdCardBatches();
  const create = useCreateIdCardBatch();
  const { yearId } = useYearSelection();
  const sections = useSectionOptions(yearId);
  const navigate = useNavigate();
  const errs = useFormErrors();
  const [templateId, setTemplateId] = useState('');
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<IdCardTemplateItem | 'new' | null>(null);
  const template = templates.data?.find((t) => t.id === templateId);
  const submit = async () => {
    errs.reset();
    try {
      const b = await create.mutateAsync({
        templateId,
        sectionIds: template?.audience === 'STUDENT' ? sectionIds : [],
      });
      navigate(`/admin/id-cards/${b.id}`);
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="ID cards"
        description="Print student ID cards by section, or staff ID cards for everyone."
      />
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">Print a batch</h2>
          {errs.general && (
            <div className="mb-3">
              <Alert>{errs.general}</Alert>
            </div>
          )}
          <Field label="Card design" htmlFor="ic-template" error={errs.fields.templateId} required>
            <Select
              id="ic-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">Choose…</option>
              {templates.data
                ?.filter((t) => t.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.audience === 'STUDENT' ? 'students' : 'staff'})
                  </option>
                ))}
            </Select>
          </Field>
          {template?.audience === 'STUDENT' && (
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-ink">Sections</legend>
              {errs.fields.sectionIds && (
                <p className="text-sm text-red-700">{errs.fields.sectionIds}</p>
              )}
              <div className="mt-2 grid max-h-60 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3">
                {sections.options.map((s) => (
                  <Checkbox
                    key={s.id}
                    label={s.label}
                    checked={sectionIds.includes(s.id)}
                    onChange={(e) =>
                      setSectionIds((ids) =>
                        e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id),
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
          )}
          {template?.audience === 'STAFF' && (
            <p className="mt-3 text-sm text-ink-muted">Cards for every active staff member.</p>
          )}
          <div className="mt-4">
            <Button onClick={submit} loading={create.isPending} disabled={!templateId}>
              Prepare cards
            </Button>
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Card designs</h2>
            <Button size="sm" variant="ghost" onClick={() => setEditing('new')}>
              New
            </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {templates.data?.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-4 rounded"
                    style={{ background: t.layout.color }}
                    aria-hidden="true"
                  />
                  {t.name}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="mt-6">
        {!batches.data?.length ? (
          <EmptyState title="No cards printed yet" />
        ) : (
          <table className="min-w-full text-sm">
            <thead className={theadClass}>
              <tr>
                <Th>Printed</Th>
                <Th>Design</Th>
                <Th>For</Th>
                <Th right>Cards</Th>
                <Th />
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {batches.data.map((b) => (
                <tr key={b.id}>
                  <Td>
                    {formatDateTime(b.createdAt)}
                    <div className="text-xs text-ink-muted">{b.createdBy}</div>
                  </Td>
                  <Td>{b.template.name}</Td>
                  <Td>{b.label}</Td>
                  <Td right>{b.cardCount}</Td>
                  <Td right>
                    <Link
                      to={`/admin/id-cards/${b.id}`}
                      className="text-sm font-medium text-brand-navy hover:underline"
                    >
                      Open
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editing && (
        <IdTemplateModal
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function IdTemplateModal({
  template,
  onClose,
}: {
  template: IdCardTemplateItem | null;
  onClose: () => void;
}) {
  const save = useSaveIdCardTemplate();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    name: template?.name ?? '',
    audience: template?.audience ?? 'STUDENT',
    isActive: template?.isActive ?? true,
    layout: template?.layout ?? {
      color: '#1e3a5f',
      showPhoto: true,
      showBloodGroup: true,
      showGuardianPhone: true,
      showAddress: false,
      footerText: 'If found, please return to the school office.',
      validity: '',
    },
  });
  const setLayout = (patch: Partial<typeof form.layout>) =>
    setForm({ ...form, layout: { ...form.layout, ...patch } });
  const submit = async () => {
    errs.reset();
    try {
      await save.mutateAsync({ id: template?.id, ...form });
      onClose();
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={template ? `Edit ${template.name}` : 'New ID card design'}
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
        {errs.general && <Alert>{errs.general}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="it-name" error={errs.fields.name} required>
            <Input
              id="it-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="For" htmlFor="it-aud">
            <Select
              id="it-aud"
              value={form.audience}
              onChange={(e) =>
                setForm({ ...form, audience: e.target.value as 'STUDENT' | 'STAFF' })
              }
            >
              {ID_CARD_AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {a === 'STUDENT' ? 'Students' : 'Staff'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Colour" htmlFor="it-color">
            <Input
              id="it-color"
              type="color"
              value={form.layout.color}
              onChange={(e) => setLayout({ color: e.target.value })}
            />
          </Field>
          <Field label="Valid until (printed)" htmlFor="it-valid">
            <Input
              id="it-valid"
              value={form.layout.validity}
              onChange={(e) => setLayout({ validity: e.target.value })}
              placeholder="March 2027"
            />
          </Field>
        </div>
        <Field label="Footer text" htmlFor="it-footer">
          <Input
            id="it-footer"
            value={form.layout.footerText}
            onChange={(e) => setLayout({ footerText: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Checkbox
            label="Photo"
            checked={form.layout.showPhoto}
            onChange={(e) => setLayout({ showPhoto: e.target.checked })}
          />
          <Checkbox
            label="Blood group"
            checked={form.layout.showBloodGroup}
            onChange={(e) => setLayout({ showBloodGroup: e.target.checked })}
          />
          <Checkbox
            label="Phone"
            checked={form.layout.showGuardianPhone}
            onChange={(e) => setLayout({ showGuardianPhone: e.target.checked })}
          />
          <Checkbox
            label="Address"
            checked={form.layout.showAddress}
            onChange={(e) => setLayout({ showAddress: e.target.checked })}
          />
        </div>
        {template && (
          <Checkbox
            label="Active"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
        )}
      </div>
    </Modal>
  );
}

function CardPhoto({ person, color }: { person: IdCardPerson; color: string }) {
  const url = usePrivateImage(person.photoPath);
  const initials = person.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  return url ? (
    <img src={url} alt="" className="h-20 w-16 rounded object-cover" />
  ) : (
    <div
      className="flex h-20 w-16 items-center justify-center rounded text-lg font-bold text-white"
      style={{ background: color }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

export function IdCardBatchPage() {
  const { id = '' } = useParams();
  const batch = useIdCardBatch(id);
  if (batch.isLoading) return <PageSpinner />;
  if (!batch.data) return <Alert>{errorMessages(batch.error)[0]}</Alert>;
  const b = batch.data;
  const l = b.template.layout;
  const staff = b.template.audience === 'STAFF';
  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          to="/admin/id-cards"
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> ID cards
        </Link>
        <span className="text-sm text-ink-muted">
          {b.people.length} cards · {b.label}
        </span>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-2">
        {b.people.map((p) => (
          <div
            key={p.id}
            className="w-[85.6mm] overflow-hidden rounded-lg border border-gray-300 bg-white text-[11px] break-inside-avoid"
            style={{ minHeight: '54mm' }}
          >
            <div className="px-3 py-1.5 text-center text-white" style={{ background: l.color }}>
              <div className="text-xs font-bold leading-tight">{b.school.name}</div>
              <div className="text-[9px] opacity-90">
                {staff ? 'STAFF IDENTITY CARD' : 'STUDENT IDENTITY CARD'}
              </div>
            </div>
            <div className="flex gap-3 p-3">
              {l.showPhoto && <CardPhoto person={p} color={l.color} />}
              <div className="min-w-0 space-y-0.5">
                <div className="text-sm font-bold text-ink">{p.name}</div>
                <div>{p.line1}</div>
                {p.line2 && <div>{p.line2}</div>}
                <div className="font-mono">{p.code}</div>
                {l.showBloodGroup && p.bloodGroup && <div>Blood group: {p.bloodGroup}</div>}
                {l.showGuardianPhone && p.phone && (
                  <div>
                    {staff ? 'Phone' : 'Parent'}: {p.phone}
                  </div>
                )}
                {l.showAddress && p.address && <div className="truncate">{p.address}</div>}
                {l.validity && <div>Valid till: {l.validity}</div>}
              </div>
            </div>
            <div className="border-t border-gray-200 px-3 py-1 text-center text-[9px] text-ink-muted">
              {l.footerText}
              {b.school.phone && ` · ${b.school.phone}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
