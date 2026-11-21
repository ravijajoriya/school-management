import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { envSchema, type Env } from './config/env.schema.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { AccessGuard } from './common/guards/access.guard.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { AcademicsModule } from './modules/academics/academics.module.js';
import { AccessControlModule } from './modules/access-control/access-control.module.js';
import { AdmissionsModule } from './modules/admissions/admissions.module.js';
import { CmsModule } from './modules/cms/cms.module.js';
import { ContactModule } from './modules/contact/contact.module.js';
import { PublicModule } from './modules/public/public.module.js';
import { StaffModule } from './modules/staff/staff.module.js';
import { StudentsModule } from './modules/students/students.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { LeaveModule } from './modules/leave/leave.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const env = config.get('NODE_ENV', { infer: true });
        return {
          pinoHttp: {
            level: env === 'test' ? 'silent' : config.get('LOG_LEVEL', { infer: true }),
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              const id = typeof incoming === 'string' && incoming ? incoming : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            // Keep request logs compact; never log credentials, cookies or tokens.
            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            },
            transport:
              env === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
                : undefined,
          },
        };
      },
    }),
    // Default: 100 requests / minute / IP. Auth endpoints declare stricter limits.
    // Disabled in automated tests, which make many requests from one address.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    StorageModule,
    AuditModule,
    AuthModule,
    AccessControlModule,
    UsersModule,
    CmsModule,
    AdmissionsModule,
    ContactModule,
    PublicModule,
    AcademicsModule,
    StaffModule,
    StudentsModule,
    AttendanceModule,
    LeaveModule,
    HealthModule,
  ],
  providers: [
    // Guards run in this order: rate limit first, then authentication/authorization.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
