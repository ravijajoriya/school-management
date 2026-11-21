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
} from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';

const listInclude = {
  user: { select: { id: true, email: true, phone: true, status: true } },
} as const;
type ListRow = Prisma.EmployeeGetPayload<{ include: typeof listInclude }>;

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
    user: r.user,
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
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        include: listInclude,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return paginated(rows.map(toListItem), total, query.page, query.pageSize);
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
        ...listInclude,
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
        },
        include: listInclude,
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
        },
        include: listInclude,
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
