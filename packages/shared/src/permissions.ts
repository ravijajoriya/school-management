/**
 * Single source of truth for permission codes.
 * The API seeds these into the `permissions` table and enforces them in guards;
 * the web app uses the same constants to show/hide actions.
 *
 * Convention: `<module>.<action>`. Add new modules phase by phase.
 */
export const PERMISSIONS = {
  // Phase 1 — identity & access
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DEACTIVATE: 'users.deactivate',
  ROLES_READ: 'roles.read',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_LOGS_READ: 'audit_logs.read',

  // Phase 2 — public website, CMS & admissions
  WEBSITE_MANAGE: 'website.manage',
  ANNOUNCEMENTS_MANAGE: 'announcements.manage',
  EVENTS_MANAGE: 'events.manage',
  MEDIA_MANAGE: 'media.manage',
  NOTICES_MANAGE: 'notices.manage',
  ENQUIRIES_READ: 'enquiries.read',
  ENQUIRIES_MANAGE: 'enquiries.manage',
  CONTACT_MESSAGES_MANAGE: 'contact_messages.manage',

  // Phase 3 — academic structure, staff & students
  ACADEMICS_READ: 'academics.read',
  ACADEMICS_MANAGE: 'academics.manage',
  EMPLOYEES_READ: 'employees.read',
  EMPLOYEES_MANAGE: 'employees.manage',
  STUDENTS_READ: 'students.read',
  STUDENTS_MANAGE: 'students.manage',
  STUDENTS_LIFECYCLE: 'students.lifecycle',

  // Phase 4 — attendance & leave
  ATTENDANCE_MARK: 'attendance.mark_assigned',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_MANAGE: 'attendance.manage',
  LEAVE_APPLY: 'leave.apply',
  LEAVE_READ: 'leave.read',
  LEAVE_APPROVE: 'leave.approve',

  // Phase 5 — fees & receipts
  FEES_READ: 'fees.read',
  FEES_CONFIGURE: 'fees.configure',
  FEES_COLLECT: 'fees.collect',
  FEES_ADJUST: 'fees.adjust',
  FEES_VOID: 'fees.void',

  // Phase 6 — examinations, results & timetable
  EXAMS_READ: 'exams.read',
  EXAMS_MANAGE: 'exams.manage',
  MARKS_ENTER: 'marks.enter_assigned',
  MARKS_APPROVE: 'marks.approve',
  TIMETABLE_READ: 'timetable.read',
  TIMETABLE_MANAGE: 'timetable.manage',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  code: PermissionCode;
  name: string;
  module: string;
  description?: string;
}

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  { code: PERMISSIONS.USERS_READ, name: 'View users', module: 'users' },
  { code: PERMISSIONS.USERS_CREATE, name: 'Create users', module: 'users' },
  { code: PERMISSIONS.USERS_UPDATE, name: 'Update users', module: 'users' },
  { code: PERMISSIONS.USERS_DEACTIVATE, name: 'Deactivate users', module: 'users' },
  { code: PERMISSIONS.ROLES_READ, name: 'View roles & permissions', module: 'access_control' },
  { code: PERMISSIONS.ROLES_MANAGE, name: 'Manage roles & permissions', module: 'access_control' },
  { code: PERMISSIONS.AUDIT_LOGS_READ, name: 'View audit logs', module: 'audit' },
  {
    code: PERMISSIONS.WEBSITE_MANAGE,
    name: 'Edit & publish website pages and school details',
    module: 'website',
  },
  {
    code: PERMISSIONS.ANNOUNCEMENTS_MANAGE,
    name: 'Manage public announcements',
    module: 'website',
  },
  { code: PERMISSIONS.EVENTS_MANAGE, name: 'Manage events', module: 'website' },
  { code: PERMISSIONS.MEDIA_MANAGE, name: 'Upload & manage gallery images', module: 'website' },
  {
    code: PERMISSIONS.NOTICES_MANAGE,
    name: 'Publish internal staff notices',
    module: 'communication',
  },
  { code: PERMISSIONS.ENQUIRIES_READ, name: 'View admission enquiries', module: 'admissions' },
  {
    code: PERMISSIONS.ENQUIRIES_MANAGE,
    name: 'Update, assign & follow up admission enquiries',
    module: 'admissions',
  },
  {
    code: PERMISSIONS.CONTACT_MESSAGES_MANAGE,
    name: 'View & handle contact form messages',
    module: 'communication',
  },
  {
    code: PERMISSIONS.ACADEMICS_READ,
    name: 'View academic years, classes, sections, subjects & assignments',
    module: 'academics',
  },
  {
    code: PERMISSIONS.ACADEMICS_MANAGE,
    name: 'Manage academic years, sections, subjects & teacher assignments',
    module: 'academics',
  },
  { code: PERMISSIONS.EMPLOYEES_READ, name: 'View staff records', module: 'staff' },
  {
    code: PERMISSIONS.EMPLOYEES_MANAGE,
    name: 'Add & edit staff records and documents',
    module: 'staff',
  },
  { code: PERMISSIONS.STUDENTS_READ, name: 'View student records', module: 'students' },
  {
    code: PERMISSIONS.STUDENTS_MANAGE,
    name: 'Register & edit students, guardians, enrolments and documents',
    module: 'students',
  },
  {
    code: PERMISSIONS.STUDENTS_LIFECYCLE,
    name: 'Promote, retain, transfer & withdraw students',
    module: 'students',
  },
  {
    code: PERMISSIONS.ATTENDANCE_MARK,
    name: 'Mark attendance for own class (class teacher, same day)',
    module: 'attendance',
  },
  {
    code: PERMISSIONS.ATTENDANCE_READ,
    name: 'View attendance of all classes and attendance reports',
    module: 'attendance',
  },
  {
    code: PERMISSIONS.ATTENDANCE_MANAGE,
    name: 'Mark any class and correct past attendance (with a reason)',
    module: 'attendance',
  },
  { code: PERMISSIONS.LEAVE_APPLY, name: 'Apply for own leave', module: 'leave' },
  { code: PERMISSIONS.LEAVE_READ, name: 'View staff leave requests', module: 'leave' },
  {
    code: PERMISSIONS.LEAVE_APPROVE,
    name: 'Approve or reject staff leave requests',
    module: 'leave',
  },
  {
    code: PERMISSIONS.FEES_READ,
    name: 'View fee ledgers, receipts and fee reports',
    module: 'fees',
  },
  {
    code: PERMISSIONS.FEES_CONFIGURE,
    name: 'Set up fee heads and fee plans, generate dues, add one-off charges',
    module: 'fees',
  },
  { code: PERMISSIONS.FEES_COLLECT, name: 'Record payments and issue receipts', module: 'fees' },
  {
    code: PERMISSIONS.FEES_ADJUST,
    name: 'Approve concessions, discounts, waivers and fines',
    module: 'fees',
  },
  {
    code: PERMISSIONS.FEES_VOID,
    name: 'Void or reverse payments and mark cheques bounced',
    module: 'fees',
  },
  { code: PERMISSIONS.EXAMS_READ, name: 'View examinations, marks and results', module: 'exams' },
  {
    code: PERMISSIONS.EXAMS_MANAGE,
    name: 'Set up examinations and grading, open marks entry, finalise results',
    module: 'exams',
  },
  {
    code: PERMISSIONS.MARKS_ENTER,
    name: 'Enter marks for own subjects and sections',
    module: 'exams',
  },
  { code: PERMISSIONS.MARKS_APPROVE, name: 'Approve or return submitted marks', module: 'exams' },
  {
    code: PERMISSIONS.TIMETABLE_READ,
    name: 'View class and teacher timetables',
    module: 'timetable',
  },
  {
    code: PERMISSIONS.TIMETABLE_MANAGE,
    name: 'Create, edit and publish timetables',
    module: 'timetable',
  },
];

/**
 * Permissions a role receives by default. Granted by the seed only when the permission is first
 * created, so later changes made under Roles & Permissions are never overwritten.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<string, readonly PermissionCode[]>> = {
  TEACHER: [PERMISSIONS.ATTENDANCE_MARK, PERMISSIONS.LEAVE_APPLY, PERMISSIONS.MARKS_ENTER],
};

/**
 * Self-service permissions used inside the Teacher Portal. Holding only these does not open the
 * Admin Portal.
 */
export const SELF_SERVICE_PERMISSIONS: ReadonlySet<PermissionCode> = new Set([
  PERMISSIONS.ATTENDANCE_MARK,
  PERMISSIONS.LEAVE_APPLY,
  PERMISSIONS.MARKS_ENTER,
]);

/** True when the user belongs in the Admin Portal (ADMIN role or any administrative permission). */
export function hasAdminAccess(roles: readonly string[], permissions: readonly string[]): boolean {
  return (
    roles.includes('ADMIN') ||
    permissions.some((p) => !SELF_SERVICE_PERMISSIONS.has(p as PermissionCode))
  );
}
