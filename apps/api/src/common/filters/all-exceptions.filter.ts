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
