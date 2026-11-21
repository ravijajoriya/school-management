import {
  MEETING_STATUSES,
  MEETING_STATUS_LABELS,
  PERMISSIONS,
  type MeetingItem,
  type MeetingStatus,
  type RosterItem,
  type StudentListItem,
} from '@school/shared';
import { useQuery } from '@tanstack/react-query';
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
  Pagination,
  Select,
} from '@/components/ui';
import { useEmployeeOptions } from '@/features/admin/people-api';
import { useAuth } from '@/features/auth/auth-context';
import { apiClient } from '@/lib/api-client';
import { formatDateTime, fromLocalInput } from '@/lib/format';
import { StudentFinder, Td, Th } from '../components/OpsParts';
import { tbodyClass, theadClass, useFormErrors } from '../ops-utils';
import { useCreateMeeting, useMeetings, useUpdateMeeting } from '../operations-api';

const TONE: Record<MeetingStatus, 'navy' | 'green' | 'gray'> = {
  SCHEDULED: 'navy',
  COMPLETED: 'green',
  CANCELLED: 'gray',
};

/**
 * Parent–teacher meetings. The office sees and schedules every meeting (admin portal);
 * a teacher sees and schedules only their own, for students of their classes (teacher portal).
 */
export function MeetingsPage({ teacherMode = false }: { teacherMode?: boolean }) {
  const { can } = useAuth();
  const canCreate = teacherMode ? can(PERMISSIONS.MEETINGS_OWN) : can(PERMISSIONS.MEETINGS_MANAGE);
  const [status, setStatus] = useState<MeetingStatus | ''>('SCHEDULED');
  const [page, setPage] = useState(1);
  const list = useMeetings({ status: status || undefined, page });
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<MeetingItem | null>(null);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={teacherMode ? 'My parent meetings' : 'Parent–teacher meetings'}
        description={
          teacherMode
            ? 'Meetings with parents of students in your classes.'
            : 'Every scheduled and past parent–teacher meeting.'
        }
        actions={canCreate && <Button onClick={() => setCreating(true)}>Schedule meeting</Button>}
      />
      <Card>
        <div className="border-b border-gray-100 p-4">
          <Field label="Show" htmlFor="mt-status">
            <Select
              id="mt-status"
              className="max-w-xs"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as MeetingStatus | '');
                setPage(1);
              }}
            >
              <option value="">All meetings</option>
              {MEETING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {MEETING_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {list.isLoading ? (
          <PageSpinner />
        ) : !list.data?.items.length ? (
          <EmptyState title="No meetings" />
        ) : (
          <>
            <table className="min-w-full text-sm">
              <thead className={theadClass}>
                <tr>
                  <Th>When</Th>
                  <Th>Student</Th>
                  <Th>Parent</Th>
                  {!teacherMode && <Th>Teacher</Th>}
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {list.data.items.map((m) => (
                  <tr key={m.id}>
                    <Td>
                      {formatDateTime(m.meetingAt)}
                      {m.venue && <div className="text-xs text-ink-muted">{m.venue}</div>}
                    </Td>
                    <Td>
                      <div className="font-medium text-ink">{m.student.fullName}</div>
                      <div className="text-xs text-ink-muted">
                        {m.student.className} – {m.student.sectionName}
                      </div>
                      {m.purpose && <div className="text-xs text-ink-muted">{m.purpose}</div>}
                    </Td>
                    <Td>
                      {m.guardian ? (
                        <>
                          {m.guardian.fullName}
                          <div className="text-xs text-ink-muted">{m.guardian.phone}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    {!teacherMode && <Td>{m.teacher.fullName}</Td>}
                    <Td>
                      <Badge tone={TONE[m.status]}>{MEETING_STATUS_LABELS[m.status]}</Badge>
                      {m.notes && (
                        <div className="mt-1 max-w-xs text-xs text-ink-muted">{m.notes}</div>
                      )}
                    </Td>
                    <Td right>
                      {(teacherMode || can(PERMISSIONS.MEETINGS_MANAGE)) && (
                        <Button size="sm" variant="ghost" onClick={() => setUpdating(m)}>
                          {m.status === 'SCHEDULED' ? 'Update' : 'Notes'}
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={list.data.page}
              totalPages={list.data.totalPages}
              total={list.data.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>
      {creating && <ScheduleModal teacherMode={teacherMode} onClose={() => setCreating(false)} />}
      {updating && <UpdateMeetingModal meeting={updating} onClose={() => setUpdating(null)} />}
    </div>
  );
}

export const TeacherMeetingsPage = () => <MeetingsPage teacherMode />;

/** Students of the teacher's sections (via the existing "My classes" endpoints). */
function useMyStudents(enabled: boolean) {
  return useQuery({
    queryKey: ['meetings', 'my-students'],
    enabled,
    queryFn: async () => {
      const sections = (
        await apiClient.get<{ sectionId: string; className: string; sectionName: string }[]>(
          '/teacher/sections',
        )
      ).data;
      const rosters = await Promise.all(
        sections.map(async (s) => ({
          section: s,
          students: (await apiClient.get<RosterItem[]>(`/teacher/sections/${s.sectionId}/students`))
            .data,
        })),
      );
      return rosters;
    },
  });
}

function ScheduleModal({ teacherMode, onClose }: { teacherMode: boolean; onClose: () => void }) {
  const create = useCreateMeeting();
  const staff = useEmployeeOptions();
  const mine = useMyStudents(teacherMode);
  const errs = useFormErrors();
  const [student, setStudent] = useState<StudentListItem | null>(null);
  const [form, setForm] = useState({
    enrolmentId: '',
    teacherEmployeeId: '',
    meetingAt: '',
    venue: '',
    purpose: '',
  });
  const submit = async () => {
    errs.reset();
    const enrolmentId = teacherMode ? form.enrolmentId : (student?.enrolment?.id ?? '');
    try {
      await create.mutateAsync({
        enrolmentId,
        teacherEmployeeId: teacherMode ? undefined : form.teacherEmployeeId,
        meetingAt: fromLocalInput(form.meetingAt) ?? '',
        venue: form.venue,
        purpose: form.purpose,
      });
      onClose();
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule parent–teacher meeting"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errs.general && <Alert>{errs.general}</Alert>}
        {teacherMode ? (
          <Field label="Student" htmlFor="ms-student" error={errs.fields.enrolmentId} required>
            <Select
              id="ms-student"
              value={form.enrolmentId}
              onChange={(e) => setForm({ ...form, enrolmentId: e.target.value })}
            >
              <option value="">Choose…</option>
              {mine.data?.map((r) => (
                <optgroup
                  key={r.section.sectionId}
                  label={`${r.section.className} – ${r.section.sectionName}`}
                >
                  {r.students.map((s) => (
                    <option key={s.enrolmentId} value={s.enrolmentId}>
                      {s.fullName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        ) : (
          <>
            <StudentFinder
              id="ms-student"
              value={student}
              onChange={setStudent}
              error={errs.fields.enrolmentId}
            />
            <Field
              label="Teacher"
              htmlFor="ms-teacher"
              error={errs.fields.teacherEmployeeId}
              required
            >
              <Select
                id="ms-teacher"
                value={form.teacherEmployeeId}
                onChange={(e) => setForm({ ...form, teacherEmployeeId: e.target.value })}
              >
                <option value="">Choose…</option>
                {staff.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.designation})
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date and time" htmlFor="ms-at" error={errs.fields.meetingAt} required>
            <Input
              id="ms-at"
              type="datetime-local"
              value={form.meetingAt}
              onChange={(e) => setForm({ ...form, meetingAt: e.target.value })}
            />
          </Field>
          <Field label="Venue" htmlFor="ms-venue">
            <Input
              id="ms-venue"
              value={form.venue}
              onChange={(e) => setForm({ ...form, venue: e.target.value })}
              placeholder="Classroom / staff room"
            />
          </Field>
        </div>
        <Field label="Purpose" htmlFor="ms-purpose">
          <Input
            id="ms-purpose"
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}

function UpdateMeetingModal({ meeting, onClose }: { meeting: MeetingItem; onClose: () => void }) {
  const update = useUpdateMeeting();
  const errs = useFormErrors();
  const [notes, setNotes] = useState(meeting.notes ?? '');
  const scheduled = meeting.status === 'SCHEDULED';
  const act = async (status?: MeetingStatus) => {
    errs.reset();
    try {
      await update.mutateAsync({ id: meeting.id, status, notes: notes || null });
      onClose();
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Meeting with ${meeting.guardian?.fullName ?? 'parent'} — ${meeting.student.fullName}`}
      footer={
        scheduled ? (
          <>
            <Button variant="danger" onClick={() => act('CANCELLED')} loading={update.isPending}>
              Cancel meeting
            </Button>
            <Button onClick={() => act('COMPLETED')} loading={update.isPending}>
              Mark as held
            </Button>
          </>
        ) : (
          <Button onClick={() => act()} loading={update.isPending}>
            Save notes
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {errs.general && <Alert>{errs.general}</Alert>}
        <p className="text-sm text-ink-muted">
          {formatDateTime(meeting.meetingAt)}
          {meeting.venue && ` · ${meeting.venue}`}
        </p>
        <Field
          label="What was discussed / agreed"
          htmlFor="mu-notes"
          error={errs.fields.notes}
          hint={scheduled ? 'Required to mark the meeting as held' : undefined}
        >
          <textarea
            id="mu-notes"
            rows={5}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
