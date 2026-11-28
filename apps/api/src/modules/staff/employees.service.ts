import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  EMPLOYEE_DOCUMENT_TYPES,
  type CreateEmployeeData,
  type DocumentItem,
  type EmployeeDetail,
  type EmployeeListItem,
  type EmployeeOption,
  type EmployeeStatus,
  type EmploymentType,
  type ListEmployeesQuery,
  type Paginated,
  type StaffRoleOption,
  type UpdateEmployeeData,
  type UserCreatedResponse,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  PrivateFilesService,
  type UploadedFile,
} from '../../infrastructure/storage/private-files.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import {
  dayToDate,
  fullName,
  isoDay,
  isoDayOrNull,
  paginated,
  schoolDate,
} from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';

/** Approved leave covering `day`. */
const onLeaveWhere = (day: string): Prisma.LeaveRequestWhereInput => ({
  status: 'APPROVED',
  startDate: { lte: dayToDate(day) },
  endDate: { gte: dayToDate(day) },
});

const listIncludeOn = (day: string) =>
  ({
    user: {
      select: {
        id: true,
        email: true,
        phone: true,
        status: true,
        roles: {
          select: { role: { select: { id: true, name: true } } },
          orderBy: { role: { name: 'asc' } },
        },
      },
    },
    leaveRequests: {
      where: onLeaveWhere(day),
      select: { leaveType: true, startDate: true, endDate: true },
      take: 1,
    },
  }) satisfies Prisma.EmployeeInclude;
type ListRow = Prisma.EmployeeGetPayload<{ include: ReturnType<typeof listIncludeOn> }>;

function toListItem(r: ListRow): EmployeeListItem {
  return {
    id: r.id,
    employeeCode: r.employeeCode,
    firstName: r.firstName,
    lastName: r.lastName,
    fullName: fullName(r.firstName, r.lastName),
    designation: r.designation,
    department: r.department,
    email: r.email,
    phone: r.phone,
    employmentType: r.employmentType as EmploymentType | null,
    status: r.status as EmployeeStatus,
    user: r.user
      ? { id: r.user.id, email: r.user.email, phone: r.user.phone, status: r.user.status }
      : null,
    roles: r.user?.roles.map((x) => x.role) ?? [],
    licenceNumber: r.licenceNumber,
    licenceExpiry: isoDayOrNull(r.licenceExpiry),
    onLeave: r.leaveRequests[0]
      ? {
          leaveType: r.leaveRequests[0].leaveType,
          startDate: isoDay(r.leaveRequests[0].startDate),
          endDate: isoDay(r.leaveRequests[0].endDate),
        }
      : null,
  };
}

export const toDocument = (d: {
  id: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: bigint;
  createdAt: Date;
  uploader: { id: string; fullName: string };
}): DocumentItem => ({
  id: d.id,
  documentType: d.documentType,
  fileName: d.fileName,
  mimeType: d.mimeType,
  fileSizeBytes: Number(d.fileSizeBytes),
  uploadedBy: d.uploader,
  createdAt: d.createdAt.toISOString(),
});

const snapshot = (e: EmployeeListItem) => ({
  employeeCode: e.employeeCode,
  licenceNumber: e.licenceNumber,
  licenceExpiry: e.licenceExpiry,
  name: e.fullName,
  designation: e.designation,
  department: e.department,
  status: e.status,
  email: e.email,
  phone: e.phone,
});

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: PrivateFilesService,
    private readonly users: UsersService,
  ) {}

  async list(query: ListEmployeesQuery): Promise<Paginated<EmployeeListItem>> {
    const tokens = query.search?.split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.EmployeeWhereInput = {
      status: query.status,
      department: query.department ? { equals: query.department, mode: 'insensitive' } : undefined,
      user: query.roleId ? { roles: { some: { roleId: query.roleId } } } : undefined,
      AND: tokens.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: 'insensitive' as const } },
          { lastName: { contains: t, mode: 'insensitive' as const } },
          { employeeCode: { contains: t, mode: 'insensitive' as const } },
          { designation: { contains: t, mode: 'insensitive' as const } },
          { phone: { contains: t.replace(/[\s-]/g, '') } },
        ],
      })),
    };
    // Staff on approved leave today are listed first (or only them, with the filter).
    const today = schoolDate();
    const onLeaveIds = (
      await this.prisma.leaveRequest.findMany({
        where: onLeaveWhere(today),
        select: { employeeId: true },
        distinct: ['employeeId'],
      })
    ).map((l) => l.employeeId);
    const include = listIncludeOn(today);
    const orderBy = [{ firstName: 'asc' as const }, { lastName: 'asc' as const }];
    const leaveWhere: Prisma.EmployeeWhereInput = { AND: [where, { id: { in: onLeaveIds } }] };
    const restWhere: Prisma.EmployeeWhereInput = { AND: [where, { id: { notIn: onLeaveIds } }] };
    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;
    if (query.onLeave) {
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.employee.count({ where: leaveWhere }),
        this.prisma.employee.findMany({ where: leaveWhere, include, orderBy, skip, take }),
      ]);
      return paginated(rows.map(toListItem), total, query.page, query.pageSize);
    }
    const [leaveCount, restCount] = await this.prisma.$transaction([
      this.prisma.employee.count({ where: leaveWhere }),
      this.prisma.employee.count({ where: restWhere }),
    ]);
    const first =
      skip < leaveCount
        ? await this.prisma.employee.findMany({ where: leaveWhere, include, orderBy, skip, take })
        : [];
    const rest =
      first.length < take
        ? await this.prisma.employee.findMany({
            where: restWhere,
            include,
            orderBy,
            skip: Math.max(0, skip - leaveCount),
            take: take - first.length,
          })
        : [];
    return paginated(
      [...first, ...rest].map(toListItem),
      leaveCount + restCount,
      query.page,
      query.pageSize,
    );
  }

  /**
   * Every role that has at least one user (counted like the Roles page), with how many of those
   * users are staff, and the ones without a staff record (they can't show in the staff list).
   */
  async roleOptions(): Promise<StaffRoleOption[]> {
    const roles = await this.prisma.role.findMany({
      where: { users: { some: {} } },
      select: {
        id: true,
        name: true,
        users: {
          select: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                status: true,
                employee: { select: { id: true } },
              },
            },
          },
          orderBy: { user: { fullName: 'asc' } },
        },
      },
      orderBy: { name: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      userCount: r.users.length,
      staffCount: r.users.filter((u) => u.user.employee).length,
      usersWithoutStaff: r.users
        .filter((u) => !u.user.employee)
        .map(({ user: u }) => ({
          id: u.id,
          fullName: u.fullName,
          login: u.email ?? u.phone,
          status: u.status,
        })),
    }));
  }

  /** Active staff for dropdowns (class teacher, teacher assignments). */
  async options(): Promise<EmployeeOption[]> {
    const rows = await this.prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true },
    });
    return rows.map((r) => ({
      id: r.id,
      fullName: fullName(r.firstName, r.lastName),
      employeeCode: r.employeeCode,
      designation: r.designation,
    }));
  }

  async get(id: string): Promise<EmployeeDetail> {
    const row = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        ...listIncludeOn(schoolDate()),
        documents: {
          orderBy: { createdAt: 'desc' },
          include: { uploader: { select: { id: true, fullName: true } } },
        },
        assignments: {
          where: { academicYear: { isActive: true } },
          include: {
            section: {
              select: { name: true, class: { select: { name: true, levelOrder: true } } },
            },
            classSubject: { select: { subject: { select: { name: true } } } },
          },
        },
        classTeacherOf: {
          where: { academicYear: { isActive: true } },
          select: { name: true, class: { select: { name: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException('Employee not found');
    return {
      ...toListItem(row),
      dateOfBirth: isoDayOrNull(row.dateOfBirth),
      joiningDate: isoDay(row.joiningDate),
      documents: row.documents.map(toDocument),
      assignments: row.assignments
        .sort((a, b) => a.section.class.levelOrder - b.section.class.levelOrder)
        .map((a) => ({
          sectionLabel: `${a.section.class.name} – ${a.section.name}`,
          subject: a.classSubject.subject.name,
        })),
      classTeacherOf: row.classTeacherOf.map((s) => `${s.class.name} – ${s.name}`),
    };
  }

  async create(input: CreateEmployeeData, actor: RequestUser, context: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      let employeeCode = input.employeeCode;
      if (!employeeCode) {
        const [{ n }] = await tx.$queryRaw<
          { n: bigint }[]
        >`SELECT nextval('employee_code_seq') AS n`;
        employeeCode = `EMP-${String(n).padStart(4, '0')}`;
      }
      const row = await tx.employee.create({
        data: {
          employeeCode,
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          dateOfBirth: input.dateOfBirth ? dayToDate(input.dateOfBirth) : null,
          joiningDate: dayToDate(input.joiningDate),
          designation: input.designation,
          department: input.department ?? null,
          employmentType: input.employmentType ?? null,
          status: input.status,
          licenceNumber: input.licenceNumber ?? null,
          licenceExpiry: input.licenceExpiry ? dayToDate(input.licenceExpiry) : null,
        },
        include: listIncludeOn(schoolDate()),
      });
      const item = toListItem(row);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.EMPLOYEE_CREATED,
          entityType: 'employee',
          entityId: item.id,
          userId: actor.id,
          after: snapshot(item),
          context,
        },
        tx,
      );
      return item;
    });
  }

  async update(id: string, input: UpdateEmployeeData, actor: RequestUser, context: RequestContext) {
    const before = await this.get(id);
    if (input.status && input.status !== 'ACTIVE') {
      // An active vehicle always needs its crew: change the vehicle first.
      const vehicle = await this.prisma.vehicle.findFirst({
        where: {
          status: 'ACTIVE',
          OR: [{ driverEmployeeId: id }, { conductorEmployeeId: id }],
        },
        select: { registrationNumber: true, driverEmployeeId: true },
      });
      if (vehicle)
        throw new ConflictException(
          `${before.fullName} is the ${vehicle.driverEmployeeId === id ? 'driver' : 'conductor'} of ${vehicle.registrationNumber}. Choose a new ${vehicle.driverEmployeeId === id ? 'driver' : 'conductor'} for that vehicle first.`,
        );
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.employee.update({
        where: { id },
        data: {
          employeeCode: input.employeeCode,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          dateOfBirth:
            input.dateOfBirth === undefined
              ? undefined
              : input.dateOfBirth
                ? dayToDate(input.dateOfBirth)
                : null,
          joiningDate: input.joiningDate ? dayToDate(input.joiningDate) : undefined,
          designation: input.designation,
          department: input.department,
          employmentType: input.employmentType,
          status: input.status,
          licenceNumber: input.licenceNumber,
          licenceExpiry:
            input.licenceExpiry === undefined
              ? undefined
              : input.licenceExpiry
                ? dayToDate(input.licenceExpiry)
                : null,
        },
        include: listIncludeOn(schoolDate()),
      });
      const item = toListItem(row);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
          entityType: 'employee',
          entityId: id,
          userId: actor.id,
          before: snapshot(before),
          after: snapshot(item),
          context,
        },
        tx,
      );
      return item;
    });
  }

  async linkUser(id: string, userId: string | null, actor: RequestUser, context: RequestContext) {
    const before = await this.get(id);
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) throw new BadRequestException(['userId: Login not found']);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id }, data: { userId } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.EMPLOYEE_USER_LINKED,
          entityType: 'employee',
          entityId: id,
          userId: actor.id,
          before: { userId: before.user?.id ?? null },
          after: { userId },
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Creates a login from the employee's email/phone, links it, and returns the temporary password once. */
  async createLogin(
    id: string,
    roleIds: string[],
    actor: RequestUser,
    context: RequestContext,
  ): Promise<UserCreatedResponse> {
    const employee = await this.get(id);
    if (employee.user) throw new ConflictException('This employee already has a login');
    if (!employee.email && !employee.phone) {
      throw new BadRequestException('Add an email or phone number to the employee record first');
    }
    const created = await this.users.create(
      {
        fullName: employee.fullName,
        email: employee.email ?? undefined,
        phone: employee.phone ?? undefined,
        roleIds,
        password: undefined,
      },
      actor,
      context,
    );
    await this.linkUser(id, created.user.id, actor, context);
    return created;
  }

  // --- Documents ----------------------------------------------------------------------

  async uploadDocument(
    id: string,
    documentType: string,
    file: UploadedFile | undefined,
    actor: RequestUser,
    context: RequestContext,
  ) {
    if (!(EMPLOYEE_DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
      throw new BadRequestException(['documentType: Choose a document type']);
    }
    await this.get(id);
    const stored = await this.files.store(file, 'document', `employees/${id}`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const doc = await tx.employeeDocument.create({
          data: { employeeId: id, documentType, uploadedBy: actor.id, ...stored },
          include: { uploader: { select: { id: true, fullName: true } } },
        });
        await this.audit.log(
          {
            action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
            entityType: 'employee',
            entityId: id,
            userId: actor.id,
            after: { documentId: doc.id, documentType, fileName: doc.fileName },
            context,
          },
          tx,
        );
        return toDocument(doc);
      });
    } catch (error) {
      await this.files.remove(stored.storageKey);
      throw error;
    }
  }

  async openDocument(id: string, documentId: string, actor: RequestUser, context: RequestContext) {
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, employeeId: id },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const file = await this.files.open(doc.storageKey);
    await this.audit.logSafe({
      action: AUDIT_ACTIONS.DOCUMENT_DOWNLOADED,
      entityType: 'employee',
      entityId: id,
      userId: actor.id,
      after: { documentId, documentType: doc.documentType },
      context,
    });
    return { ...file, mimeType: doc.mimeType, fileName: doc.fileName };
  }

  async deleteDocument(
    id: string,
    documentId: string,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, employeeId: id },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.employeeDocument.delete({ where: { id: documentId } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.DOCUMENT_DELETED,
          entityType: 'employee',
          entityId: id,
          userId: actor.id,
          before: { documentId, documentType: doc.documentType, fileName: doc.fileName },
          context,
        },
        tx,
      );
    });
    await this.files.remove(doc.storageKey);
  }
}
