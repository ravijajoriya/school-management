import { PERMISSIONS, type PermissionCode } from '@school/shared';
import {
  Award,
  BellRing,
  BookOpen,
  BookOpenCheck,
  Boxes,
  Briefcase,
  Bus,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  ChartColumn,
  ClipboardList,
  FileChartColumn,
  FileUp,
  Globe,
  GraduationCap,
  Handshake,
  History,
  IdCard,
  Images,
  Inbox,
  IndianRupee,
  Layers,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageSquareWarning,
  PartyPopper,
  Receipt,
  School,
  ScrollText,
  Settings,
  ShieldCheck,
  SquareCheck,
  Tags,
  TrendingUp,
  UserCheck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import type { RouteObject } from 'react-router';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { PortalLayout, type PortalNavItem } from '@/layouts/PortalLayout';

const ADMIN_NAV: PortalNavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  {
    to: '/admin/students',
    label: 'Students',
    icon: GraduationCap,
    permissions: [PERMISSIONS.STUDENTS_READ],
    section: 'People',
  },
  {
    to: '/admin/promotions',
    label: 'Promotions',
    icon: TrendingUp,
    permissions: [PERMISSIONS.STUDENTS_LIFECYCLE],
    section: 'People',
  },
  {
    to: '/admin/staff',
    label: 'Staff',
    icon: Users,
    permissions: [PERMISSIONS.EMPLOYEES_READ],
    section: 'People',
  },
  {
    to: '/admin/leave',
    label: 'Staff Leave',
    icon: CalendarOff,
    permissions: [PERMISSIONS.LEAVE_READ],
    section: 'People',
  },
  {
    to: '/admin/exams',
    label: 'Examinations',
    icon: ClipboardList,
    end: true,
    permissions: [PERMISSIONS.EXAMS_READ],
    section: 'Exams & Timetable',
  },
  {
    to: '/admin/exams/grading',
    label: 'Grading Scales',
    icon: Award,
    permissions: [PERMISSIONS.EXAMS_READ],
    section: 'Exams & Timetable',
  },
  {
    to: '/admin/timetables',
    label: 'Timetables',
    icon: CalendarClock,
    permissions: [PERMISSIONS.TIMETABLE_READ],
    section: 'Exams & Timetable',
  },
  {
    to: '/admin/fees/collect',
    label: 'Collect Fees',
    icon: IndianRupee,
    permissions: [PERMISSIONS.FEES_COLLECT],
    section: 'Fees',
  },
  {
    to: '/admin/fees/payments',
    label: 'Payments & Receipts',
    icon: Receipt,
    permissions: [PERMISSIONS.FEES_READ],
    section: 'Fees',
  },
  {
    to: '/admin/fees/reports',
    label: 'Fee Reports',
    icon: ChartColumn,
    permissions: [PERMISSIONS.FEES_READ],
    section: 'Fees',
  },
  {
    to: '/admin/fees/plans',
    label: 'Fee Plans',
    icon: Layers,
    permissions: [PERMISSIONS.FEES_READ],
    section: 'Fees',
  },
  {
    to: '/admin/fees/heads',
    label: 'Fee Heads',
    icon: Tags,
    permissions: [PERMISSIONS.FEES_READ],
    section: 'Fees',
  },
  {
    to: '/admin/attendance',
    label: 'Mark & Correct',
    icon: SquareCheck,
    end: true,
    permissions: [PERMISSIONS.ATTENDANCE_READ],
    section: 'Attendance',
  },
  {
    to: '/admin/attendance/daily',
    label: 'Daily Report',
    icon: CalendarCheck,
    permissions: [PERMISSIONS.ATTENDANCE_READ],
    section: 'Attendance',
  },
  {
    to: '/admin/attendance/monthly',
    label: 'Monthly Report',
    icon: CalendarRange,
    permissions: [PERMISSIONS.ATTENDANCE_READ],
    section: 'Attendance',
  },
  {
    to: '/admin/attendance/register',
    label: 'Class Register',
    icon: BookOpenCheck,
    permissions: [PERMISSIONS.ATTENDANCE_READ],
    section: 'Attendance',
  },
  {
    to: '/admin/transport',
    label: 'Transport',
    icon: Bus,
    permissions: [PERMISSIONS.TRANSPORT_READ],
    section: 'Operations',
  },
  {
    to: '/admin/complaints',
    label: 'Complaints',
    icon: MessageSquareWarning,
    permissions: [PERMISSIONS.COMPLAINTS_READ],
    section: 'Operations',
  },
  {
    to: '/admin/meetings',
    label: 'Parent Meetings',
    icon: Handshake,
    permissions: [PERMISSIONS.MEETINGS_READ],
    section: 'Operations',
  },
  {
    to: '/admin/inventory',
    label: 'Inventory',
    icon: Boxes,
    permissions: [PERMISSIONS.INVENTORY_READ],
    section: 'Operations',
  },
  {
    to: '/admin/payroll',
    label: 'Payroll',
    icon: Wallet,
    permissions: [PERMISSIONS.PAYROLL_READ],
    section: 'Operations',
  },
  {
    to: '/admin/certificates',
    label: 'Certificates',
    icon: ScrollText,
    permissions: [PERMISSIONS.CERTIFICATES_ISSUE],
    section: 'Operations',
  },
  {
    to: '/admin/id-cards',
    label: 'ID Cards',
    icon: IdCard,
    permissions: [PERMISSIONS.ID_CARDS_GENERATE],
    section: 'Operations',
  },
  {
    to: '/admin/academic-years',
    label: 'Academic Years',
    icon: CalendarDays,
    permissions: [PERMISSIONS.ACADEMICS_READ],
    section: 'Academics',
  },
  {
    to: '/admin/classes',
    label: 'Classes & Sections',
    icon: School,
    permissions: [PERMISSIONS.ACADEMICS_READ],
    section: 'Academics',
  },
  {
    to: '/admin/subjects',
    label: 'Subjects',
    icon: BookOpen,
    permissions: [PERMISSIONS.ACADEMICS_READ],
    section: 'Academics',
  },
  {
    to: '/admin/teacher-assignments',
    label: 'Teacher Assignments',
    icon: UserCheck,
    permissions: [PERMISSIONS.ACADEMICS_READ],
    section: 'Academics',
  },
  {
    to: '/admin/website',
    label: 'Website Pages',
    icon: Globe,
    permissions: [PERMISSIONS.WEBSITE_MANAGE],
    section: 'Website',
  },
  {
    to: '/admin/announcements',
    label: 'Announcements',
    icon: Megaphone,
    permissions: [PERMISSIONS.ANNOUNCEMENTS_MANAGE],
    section: 'Website',
  },
  {
    to: '/admin/events',
    label: 'Events',
    icon: PartyPopper,
    permissions: [PERMISSIONS.EVENTS_MANAGE],
    section: 'Website',
  },
  {
    to: '/admin/media',
    label: 'Media Library',
    icon: Images,
    permissions: [PERMISSIONS.MEDIA_MANAGE],
    section: 'Website',
  },
  {
    to: '/admin/enquiries',
    label: 'Enquiries',
    icon: Inbox,
    permissions: [PERMISSIONS.ENQUIRIES_READ],
    section: 'Admissions',
  },
  {
    to: '/admin/messages',
    label: 'Contact Messages',
    icon: Mail,
    permissions: [PERMISSIONS.CONTACT_MESSAGES_MANAGE],
    section: 'Admissions',
  },
  {
    to: '/admin/reports',
    label: 'Reports & Exports',
    icon: FileChartColumn,
    section: 'Administration',
  },
  {
    to: '/admin/imports',
    label: 'Import Data',
    icon: FileUp,
    permissions: [PERMISSIONS.DATA_IMPORT],
    section: 'Administration',
  },
  {
    to: '/admin/notices',
    label: 'Staff Notices',
    icon: BellRing,
    permissions: [PERMISSIONS.NOTICES_MANAGE],
    section: 'Administration',
  },
  {
    to: '/admin/users',
    label: 'Users',
    icon: UserCog,
    permissions: [PERMISSIONS.USERS_READ],
    section: 'Administration',
  },
  {
    to: '/admin/roles',
    label: 'Roles & Permissions',
    icon: ShieldCheck,
    permissions: [PERMISSIONS.ROLES_READ],
    section: 'Administration',
  },
  {
    to: '/admin/audit-logs',
    label: 'Audit Logs',
    icon: History,
    permissions: [PERMISSIONS.AUDIT_LOGS_READ],
    section: 'Administration',
  },
];

/** Icons for the collapsible sidebar sections. */
const ADMIN_SECTION_ICONS = {
  People: Users,
  'Exams & Timetable': ClipboardList,
  Fees: Wallet,
  Attendance: CalendarCheck,
  Operations: Briefcase,
  Academics: School,
  Website: Globe,
  Admissions: Inbox,
  Administration: Settings,
};

const cms = () => import('@/features/admin/cms/CmsAdminPages');
const website = () => import('@/features/admin/website/WebsitePages');
const enquiries = () => import('@/features/admin/enquiries/EnquiryPages');
const academics = () => import('@/features/admin/academics/AcademicsPages');
const staff = () => import('@/features/admin/staff/StaffPages');
const students = () => import('@/features/admin/students/StudentPages');
const attendance = () => import('@/features/attendance/pages/AdminAttendancePages');
const feeSetup = () => import('@/features/fees/pages/FeeSetupPages');
const exams = () => import('@/features/exams/pages/ExamAdminPages');
const results = () => import('@/features/exams/pages/ResultsPages');
const timetables = () => import('@/features/timetable/pages/TimetablePages');
const feeLedger = () => import('@/features/fees/pages/FeeLedgerPages');
const feeReports = () => import('@/features/fees/pages/FeeReportPages');
const transport = () => import('@/features/operations/pages/TransportPages');
const complaints = () => import('@/features/operations/pages/ComplaintPages');
const meetings = () => import('@/features/operations/pages/MeetingPages');
const inventory = () => import('@/features/operations/pages/InventoryPages');
const payroll = () => import('@/features/operations/pages/PayrollPages');
const certificates = () => import('@/features/operations/pages/CertificatePages');

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
      element: (
        <PortalLayout title="Admin Portal" nav={ADMIN_NAV} sectionIcons={ADMIN_SECTION_ICONS} />
      ),
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
        guarded('exams', PERMISSIONS.EXAMS_READ, async () => ({
          Component: (await exams()).ExamsPage,
        })),
        guarded('exams/grading', PERMISSIONS.EXAMS_READ, async () => ({
          Component: (await exams()).GradingScalesPage,
        })),
        guarded('exams/:id', PERMISSIONS.EXAMS_READ, async () => ({
          Component: (await exams()).ExamDetailPage,
        })),
        guarded('exams/:id/marks', PERMISSIONS.EXAMS_READ, async () => ({
          Component: (await exams()).ExamMarksPage,
        })),
        guarded('exams/:id/results', PERMISSIONS.EXAMS_READ, async () => ({
          Component: (await results()).SectionResultsPage,
        })),
        guarded('exams/:id/report-cards/:enrolmentId', PERMISSIONS.EXAMS_READ, async () => ({
          Component: (await results()).ReportCardPage,
        })),
        guarded('timetables', PERMISSIONS.TIMETABLE_READ, async () => ({
          Component: (await timetables()).TimetablesPage,
        })),
        guarded('timetables/teachers', PERMISSIONS.TIMETABLE_READ, async () => ({
          Component: (await timetables()).TeacherTimetablesPage,
        })),
        guarded('timetables/:id', PERMISSIONS.TIMETABLE_READ, async () => ({
          Component: (await timetables()).TimetableEditorPage,
        })),
        guarded('fees/collect', PERMISSIONS.FEES_COLLECT, async () => ({
          Component: (await feeLedger()).CollectFeesPage,
        })),
        guarded('fees/students/:studentId', PERMISSIONS.FEES_READ, async () => ({
          Component: (await feeLedger()).StudentFeesPage,
        })),
        guarded('fees/receipts/:paymentId', PERMISSIONS.FEES_READ, async () => ({
          Component: (await feeLedger()).ReceiptPage,
        })),
        guarded('fees/payments', PERMISSIONS.FEES_READ, async () => ({
          Component: (await feeReports()).PaymentsPage,
        })),
        guarded('fees/reports', PERMISSIONS.FEES_READ, async () => ({
          Component: (await feeReports()).FeeReportsPage,
        })),
        guarded('fees/plans', PERMISSIONS.FEES_READ, async () => ({
          Component: (await feeSetup()).FeePlansPage,
        })),
        guarded('fees/heads', PERMISSIONS.FEES_READ, async () => ({
          Component: (await feeSetup()).FeeHeadsPage,
        })),
        {
          path: 'reports',
          lazy: async () => ({
            Component: (await import('@/features/reports/pages/ReportsPages')).ReportsPage,
          }),
        },
        guarded('imports', PERMISSIONS.DATA_IMPORT, async () => ({
          Component: (await import('@/features/reports/pages/ImportPage')).ImportPage,
        })),
        guarded('transport', PERMISSIONS.TRANSPORT_READ, async () => ({
          Component: (await transport()).RoutesPage,
        })),
        guarded('transport/students', PERMISSIONS.TRANSPORT_READ, async () => ({
          Component: (await transport()).TransportStudentsPage,
        })),
        guarded('transport/vehicles', PERMISSIONS.TRANSPORT_READ, async () => ({
          Component: (await transport()).VehiclesPage,
        })),
        guarded('transport/routes/:id', PERMISSIONS.TRANSPORT_READ, async () => ({
          Component: (await transport()).RouteSheetPage,
        })),
        guarded('complaints', PERMISSIONS.COMPLAINTS_READ, async () => ({
          Component: (await complaints()).ComplaintsPage,
        })),
        guarded('complaints/:id', PERMISSIONS.COMPLAINTS_READ, async () => ({
          Component: (await complaints()).ComplaintDetailPage,
        })),
        guarded('meetings', PERMISSIONS.MEETINGS_READ, async () => ({
          Component: (await meetings()).MeetingsPage,
        })),
        guarded('inventory', PERMISSIONS.INVENTORY_READ, async () => ({
          Component: (await inventory()).InventoryPage,
        })),
        guarded('payroll', PERMISSIONS.PAYROLL_READ, async () => ({
          Component: (await payroll()).PayrollRunsPage,
        })),
        guarded('payroll/components', PERMISSIONS.PAYROLL_READ, async () => ({
          Component: (await payroll()).SalaryComponentsPage,
        })),
        guarded('payroll/payslips/:recordId', PERMISSIONS.PAYROLL_READ, async () => ({
          Component: (await payroll()).PayslipPage,
        })),
        guarded('payroll/:id', PERMISSIONS.PAYROLL_READ, async () => ({
          Component: (await payroll()).PayrollRunPage,
        })),
        guarded('certificates', PERMISSIONS.CERTIFICATES_ISSUE, async () => ({
          Component: (await certificates()).CertificatesPage,
        })),
        guarded('certificates/templates', PERMISSIONS.CERTIFICATES_TEMPLATES, async () => ({
          Component: (await certificates()).CertificateTemplatesPage,
        })),
        guarded('certificates/:id', PERMISSIONS.CERTIFICATES_ISSUE, async () => ({
          Component: (await certificates()).CertificateViewPage,
        })),
        guarded('id-cards', PERMISSIONS.ID_CARDS_GENERATE, async () => ({
          Component: (await certificates()).IdCardsPage,
        })),
        guarded('id-cards/:id', PERMISSIONS.ID_CARDS_GENERATE, async () => ({
          Component: (await certificates()).IdCardBatchPage,
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
