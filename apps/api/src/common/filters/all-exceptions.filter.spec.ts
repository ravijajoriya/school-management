import { Logger, type ArgumentsHost } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown) {
  const json = vi.fn<(body: { message: string | string[] }) => void>();
  const response = { status: vi.fn<(code: number) => { json: typeof json }>(() => ({ json })) };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/api/v1/test', id: 'req-1' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: response.status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

const prismaError = (code: string, cause: object) =>
  new Prisma.PrismaClientKnownRequestError('db error', {
    code,
    clientVersion: 'test',
    meta: { driverAdapterError: { cause } },
  });

describe('AllExceptionsFilter', () => {
  it('maps unique violations to a field message (409)', () => {
    const { status, body } = run(
      prismaError('P2002', {
        table: 'attendance_records',
        constraint: { index: 'attendance_records_enrolment_date_session_key' },
      }),
    );
    expect(status).toBe(409);
    expect(body.message[0]).toMatch(/^entries: Attendance for this day was just saved/);
  });

  it('maps exclusion violations (overlapping leave) to 409', () => {
    const { status, body } = run(
      prismaError('P2039', {
        code: '23P01',
        message: 'conflicting key value violates exclusion constraint "leave_requests_no_overlap"',
      }),
    );
    expect(status).toBe(409);
    expect(body.message).toEqual([
      'startDate: This overlaps another pending or approved leave request',
    ]);
  });

  it('hides unexpected errors behind a generic 500', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const { status, body } = run(new Error('secret internals'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
