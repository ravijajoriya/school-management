import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

/** Uniform error body returned by every endpoint. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId?: string;
}

/** Human-readable messages for unique constraints, keyed by column. */
const UNIQUE_MESSAGES: Record<string, string> = {
  email: 'email: This email address is already in use',
  phone: 'phone: This phone number is already in use',
  code: 'code: This code is already in use',
  name: 'name: This name is already in use',
  admission_number: 'admissionNumber: This admission number is already in use',
  employee_code: 'employeeCode: This employee code is already in use',
  user_id: 'userId: This login is already linked to another employee',
  academic_year_id_class_id_name: 'name: A section with this name already exists for this class',
  academic_year_id_class_id_subject_id: 'subjectId: This subject is already set for the class',
  employee_id_section_id_class_subject_id:
    'classSubjectId: This teacher is already assigned to this subject and section',
  student_id_academic_year_id:
    'academicYearId: The student is already enrolled in this academic year',
  section_id_roll_number: 'rollNumber: This roll number is already used in the section',
  converted_student_id: 'This enquiry has already been converted',
  registration_number: 'registrationNumber: A vehicle with this registration number already exists',
  route_id_name: 'stops: Two stops on this route have the same name',
  asset_code: 'assetCode: This asset code is already in use',
  period_start: 'month: Payroll for this month already exists',
  payroll_run_id_employee_id: 'employeeId: This staff member is already in the payroll',
  payroll_record_id_salary_component_id: 'lines: Each component can appear only once',
  certificate_number: 'Another certificate was issued at the same moment — try again',
  teacher_employee_id_meeting_at: 'meetingAt: The teacher already has a meeting at this time',
  enrolment_date_session:
    'entries: Attendance for this day was just saved by someone else — reload and try again',
};

/** Messages for exclusion constraints (Postgres 23P01), keyed by constraint name. */
const EXCLUSION_MESSAGES: Record<string, string> = {
  leave_requests_no_overlap: 'startDate: This overlaps another pending or approved leave request',
  holidays_no_overlap: 'startDate: This overlaps another holiday in the same year',
  student_transport_no_overlap:
    'startDate: The student already has transport for these dates — end the current route first',
};

/**
 * Converts any thrown error into the uniform `ApiErrorBody`.
 * Unexpected (non-HTTP) errors are logged with their stack and returned as a generic 500,
 * so internal details never leak to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else {
        const b = body as { message?: string | string[]; error?: string };
        message = b.message ?? exception.message;
        error = b.error ?? exception.name;
      }
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === 'P2002'
    ) {
      statusCode = HttpStatus.CONFLICT;
      error = 'Conflict';
      const fields = this.uniqueFields(exception);
      message = fields.length
        ? fields.map((f) => UNIQUE_MESSAGES[f] ?? `${f}: This value is already in use`)
        : 'This record already exists';
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      this.pgCode(exception) === '23P01'
    ) {
      statusCode = HttpStatus.CONFLICT;
      error = 'Conflict';
      const text = this.pgMessage(exception);
      const name = Object.keys(EXCLUSION_MESSAGES).find((k) => text.includes(k));
      message = name ? [EXCLUSION_MESSAGES[name]] : 'This conflicts with an existing record';
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === 'P2025'
    ) {
      statusCode = HttpStatus.NOT_FOUND;
      error = 'Not Found';
      message = 'Record not found';
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const payload: ApiErrorBody = {
      statusCode,
      error,
      message,
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
      requestId: request.id ? String(request.id) : undefined,
    };

    response.status(statusCode).json(payload);
  }

  /** Extracts the violated column names from a P2002 error (shape differs across drivers). */
  private pgCause(error: Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta as
      { driverAdapterError?: { cause?: { code?: string; message?: string } } } | undefined;
    return meta?.driverAdapterError?.cause;
  }

  private pgCode(error: Prisma.PrismaClientKnownRequestError) {
    return this.pgCause(error)?.code;
  }

  private pgMessage(error: Prisma.PrismaClientKnownRequestError) {
    return this.pgCause(error)?.message ?? '';
  }

  private uniqueFields(error: Prisma.PrismaClientKnownRequestError): string[] {
    const meta = error.meta as
      | {
          target?: string[] | string;
          driverAdapterError?: {
            cause?: { table?: string; constraint?: { fields?: string[]; index?: string } };
          };
        }
      | undefined;
    const cause = meta?.driverAdapterError?.cause;
    if (Array.isArray(cause?.constraint?.fields)) {
      return cause.constraint.fields.map((f) => f.replace(/"/g, ''));
    }
    // pg adapter reports the index name, e.g. users_email_key -> email.
    const index = cause?.constraint?.index;
    if (index) {
      const prefix = cause?.table ? `${cause.table}_` : '';
      return [index.replace(prefix, '').replace(/_key$/, '')];
    }
    if (Array.isArray(meta?.target)) return meta.target;
    if (typeof meta?.target === 'string') {
      return Object.keys(UNIQUE_MESSAGES).filter((k) => meta.target!.includes(k));
    }
    return [];
  }
}
