import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AuthResponse } from '@school/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { seedDatabase } from '../src/database/seed/seed.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';

export const API = '/api/v1';

export const ADMIN = { email: 'admin@test.local', password: 'Admin-Pass-1' } as const;
export const TEACHER = { email: 'teacher@test.local', password: 'Teacher-Pass-1' } as const;

export interface TestContext {
  app: NestExpressApplication;
  http: App;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return { app, http: app.getHttpServer() as App, prisma: app.get(PrismaService) };
}

/**
 * Empties every table and re-seeds roles, permissions, classes, website pages, one admin and one teacher.
 * audit_logs is append-only via triggers, so its user triggers are disabled just for the reset.
 */
export async function resetDatabase(
  prisma: PrismaService,
  opts: { passwordChanged?: boolean } = {},
) {
  await prisma.$transaction([
    prisma.$executeRawUnsafe('ALTER TABLE "audit_logs" DISABLE TRIGGER USER'),
    prisma.$executeRawUnsafe(
      'TRUNCATE "audit_logs", "attendance_records", "leave_requests", "refresh_tokens", "user_roles", "role_permissions", "teacher_assignments", "student_documents", "student_enrolments", "student_guardians", "employee_documents", "sections", "class_subjects", "subjects", "academic_years", "enquiry_follow_ups", "admission_enquiries", "students", "employees", "classes", "contact_messages", "website_pages", "media_assets", "events", "internal_notices", "announcements", "users", "roles", "permissions" CASCADE',
    ),
    prisma.$executeRawUnsafe('ALTER TABLE "audit_logs" ENABLE TRIGGER USER'),
  ]);
  await seedDatabase(prisma, {
    admin: { fullName: 'Test Admin', email: ADMIN.email, password: ADMIN.password },
    teacher: { fullName: 'Test Teacher', email: TEACHER.email, password: TEACHER.password },
  });
  if (opts.passwordChanged !== false) {
    // Most tests want ready-to-use accounts; auth tests opt out to exercise the forced change.
    await prisma.user.updateMany({ data: { mustChangePassword: false } });
  }
}

export interface LoginResult {
  body: AuthResponse;
  token: string;
  /** Raw `Set-Cookie` header value for the refresh cookie (name=value; ...). */
  cookie: string;
}

export async function login(http: App, identifier: string, password: string): Promise<LoginResult> {
  const res = await request(http)
    .post(`${API}/auth/login`)
    .send({ identifier, password })
    .expect(200);
  return {
    body: res.body as AuthResponse,
    token: res.body.accessToken,
    cookie: refreshCookie(res),
  };
}

export function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('sm_rt='));
  if (!cookie) throw new Error('No refresh cookie in response');
  return cookie;
}

/** Just the `name=value` part, as a browser would send it back. */
export const cookiePair = (setCookie: string) => setCookie.split(';')[0];

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
