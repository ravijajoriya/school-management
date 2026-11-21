import { PERMISSIONS, type PermissionCode } from '@school/shared';
import type { RouteObject } from 'react-router';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { PortalLayout, type PortalNavItem } from '@/layouts/PortalLayout';

const ADMIN_NAV: PortalNavItem[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  {
    to: '/admin/students',
    label: 'Students',
    permissions: [PERMISSIONS.STUDENTS_READ],
    section: 'People',
  },
  {
    to: '/admin/promotions',
    label: 'Promotions',
    permissions: [PERMISSIONS.STUDENTS_LIFECYCLE],
    section: 'People',
  },
  {
    to: '/admin/staff',
    label: 'Staff',
    permissions: [PERMISSIONS.EMPLOYEES_READ],
    section: 'People',
  },
  {
    to: '/admin/leave',
    label: 'Staff Leave',
    permissions: [PERMISSIONS.LEAVE_READ],
    section: 'People',
  },
  {
    to: '/admin/attendance',
    label: 'Mark & Correct',
    end: true,
    permissions: [PERMISSIONS.ATTENDANCE_READ],
    section: 'Attendance',
  },
  {
    to: '/admin/attendance/daily',
    label: 'Daily Report',
    permissions: [PERMISSIONS.ATTENDANCE_READ],
    section: 'Attendance',
  },
  {
    to: '/admin/attendance/monthly',
    label: 'Monthly Report',
    permissions: [PERMISSIONS.ATTENDANCE_READ],
    section: 'Attendance',
  },
  {
    to: '/admin/attendance/register',
    label: 'Class Register',
    permissions: [PERMISSIONS.ATTENDANCE_READ],
    section: 'Attendance',
  },
  {
    to: '/admin/academic-years',
    label: 'Academic Years',
    permissions: [PERMISSIONS.ACADEMICS_READ],
    section: 'Academics',
  },
  {
    to: '/admin/classes',
    label: 'Classes & Sections',
    permissions: [PERMISSIONS.ACADEMICS_READ],
    section: 'Academics',
  },
  {
    to: '/admin/subjects',
    label: 'Subjects',
    permissions: [PERMISSIONS.ACADEMICS_READ],
    section: 'Academics',
  },
  {
    to: '/admin/teacher-assignments',
    label: 'Teacher Assignments',
    permissions: [PERMISSIONS.ACADEMICS_READ],
    section: 'Academics',
  },
  {
    to: '/admin/website',
    label: 'Website Pages',
    permissions: [PERMISSIONS.WEBSITE_MANAGE],
    section: 'Website',
  },
  {
    to: '/admin/announcements',
    label: 'Announcements',
    permissions: [PERMISSIONS.ANNOUNCEMENTS_MANAGE],
    section: 'Website',
  },
  {
    to: '/admin/events',
    label: 'Events',
    permissions: [PERMISSIONS.EVENTS_MANAGE],
    section: 'Website',
  },
  {
    to: '/admin/media',
    label: 'Media Library',
    permissions: [PERMISSIONS.MEDIA_MANAGE],
    section: 'Website',
  },
  {
    to: '/admin/enquiries',
    label: 'Enquiries',
    permissions: [PERMISSIONS.ENQUIRIES_READ],
    section: 'Admissions',
  },
  {
    to: '/admin/messages',
    label: 'Contact Messages',
    permissions: [PERMISSIONS.CONTACT_MESSAGES_MANAGE],
    section: 'Admissions',
  },
  {
    to: '/admin/notices',
    label: 'Staff Notices',
    permissions: [PERMISSIONS.NOTICES_MANAGE],
    section: 'Administration',
  },
  {
    to: '/admin/users',
    label: 'Users',
    permissions: [PERMISSIONS.USERS_READ],
    section: 'Administration',
  },
  {
    to: '/admin/roles',
    label: 'Roles & Permissions',
    permissions: [PERMISSIONS.ROLES_READ],
    section: 'Administration',
  },
  {
    to: '/admin/audit-logs',
    label: 'Audit Logs',
    permissions: [PERMISSIONS.AUDIT_LOGS_READ],
    section: 'Administration',
  },
];

const cms = () => import('@/features/admin/cms/CmsAdminPages');
const website = () => import('@/features/admin/website/WebsitePages');
const enquiries = () => import('@/features/admin/enquiries/EnquiryPages');
const academics = () => import('@/features/admin/academics/AcademicsPages');
const staff = () => import('@/features/admin/staff/StaffPages');
const students = () => import('@/features/admin/students/StudentPages');
const attendance = () => import('@/features/attendance/pages/AdminAttendancePages');

/** A permission-guarded, lazy-loaded admin page. */
function guarded(
  path: string,
  permission: PermissionCode,
  load: () => Promise<{ Component: React.ComponentType }>,
): RouteObject {
  return {
    path,
    element: <RequireAuth permissions={[permission]} />,
    children: [{ index: true, lazy: load }],
  };
}

/**
 * Admin portal. Pages are lazy-loaded so public-website visitors never download portal code.
 * Every page re-checks its permission here; the API enforces the same rules independently.
 */
export const adminRoutes: RouteObject = {
  path: 'admin',
  element: <RequireAuth adminArea />,
  children: [
    {
      element: <PortalLayout title="Admin Portal" nav={ADMIN_NAV} />,
      children: [
        {
          index: true,
          lazy: async () => ({
            Component: (await import('@/features/admin/pages/AdminDashboardPage'))
              .AdminDashboardPage,
          }),
        },
        guarded('students', PERMISSIONS.STUDENTS_READ, async () => ({
          Component: (await students()).StudentsPage,
        })),
        guarded('students/new', PERMISSIONS.STUDENTS_MANAGE, async () => ({
          Component: (await students()).RegisterStudentPage,
        })),
        guarded('students/:id', PERMISSIONS.STUDENTS_READ, async () => ({
          Component: (await students()).StudentDetailPage,
        })),
        guarded('promotions', PERMISSIONS.STUDENTS_LIFECYCLE, async () => ({
          Component: (await students()).PromotionsPage,
        })),
        guarded('staff', PERMISSIONS.EMPLOYEES_READ, async () => ({
          Component: (await staff()).EmployeesPage,
        })),
        guarded('staff/:id', PERMISSIONS.EMPLOYEES_READ, async () => ({
          Component: (await staff()).EmployeeDetailPage,
        })),
        guarded('leave', PERMISSIONS.LEAVE_READ, async () => ({
          Component: (await import('@/features/leave/LeavePages')).LeaveRequestsPage,
        })),
        guarded('attendance', PERMISSIONS.ATTENDANCE_READ, async () => ({
          Component: (await attendance()).MarkAttendancePage,
        })),
        guarded('attendance/daily', PERMISSIONS.ATTENDANCE_READ, async () => ({
          Component: (await attendance()).DailyAttendancePage,
        })),
        guarded('attendance/monthly', PERMISSIONS.ATTENDANCE_READ, async () => ({
          Component: (await attendance()).MonthlyAttendancePage,
        })),
        guarded('attendance/register', PERMISSIONS.ATTENDANCE_READ, async () => ({
          Component: (await attendance()).AttendanceRegisterPage,
        })),
        guarded('academic-years', PERMISSIONS.ACADEMICS_READ, async () => ({
          Component: (await academics()).AcademicYearsPage,
        })),
        guarded('classes', PERMISSIONS.ACADEMICS_READ, async () => ({
          Component: (await academics()).ClassesSectionsPage,
        })),
        guarded('subjects', PERMISSIONS.ACADEMICS_READ, async () => ({
          Component: (await academics()).SubjectsPage,
        })),
        guarded('teacher-assignments', PERMISSIONS.ACADEMICS_READ, async () => ({
          Component: (await academics()).TeacherAssignmentsPage,
        })),
        guarded('website', PERMISSIONS.WEBSITE_MANAGE, async () => ({
          Component: (await website()).WebsitePagesPage,
        })),
        guarded('website/:key', PERMISSIONS.WEBSITE_MANAGE, async () => ({
          Component: (await website()).PageEditorPage,
        })),
        guarded('announcements', PERMISSIONS.ANNOUNCEMENTS_MANAGE, async () => ({
          Component: (await cms()).AnnouncementsAdminPage,
        })),
        guarded('events', PERMISSIONS.EVENTS_MANAGE, async () => ({
          Component: (await cms()).EventsAdminPage,
        })),
        guarded('media', PERMISSIONS.MEDIA_MANAGE, async () => ({
          Component: (await cms()).MediaLibraryPage,
        })),
        guarded('notices', PERMISSIONS.NOTICES_MANAGE, async () => ({
          Component: (await cms()).NoticesAdminPage,
        })),
        guarded('enquiries', PERMISSIONS.ENQUIRIES_READ, async () => ({
          Component: (await enquiries()).EnquiriesPage,
        })),
        guarded('enquiries/:id', PERMISSIONS.ENQUIRIES_READ, async () => ({
          Component: (await enquiries()).EnquiryDetailPage,
        })),
        guarded('messages', PERMISSIONS.CONTACT_MESSAGES_MANAGE, async () => ({
          Component: (await enquiries()).ContactMessagesPage,
        })),
        guarded('users', PERMISSIONS.USERS_READ, async () => ({
          Component: (await import('@/features/admin/pages/UsersPage')).UsersPage,
        })),
        guarded('roles', PERMISSIONS.ROLES_READ, async () => ({
          Component: (await import('@/features/admin/pages/RolesPage')).RolesPage,
        })),
        guarded('audit-logs', PERMISSIONS.AUDIT_LOGS_READ, async () => ({
          Component: (await import('@/features/admin/pages/AuditLogsPage')).AuditLogsPage,
        })),
      ],
    },
  ],
};
