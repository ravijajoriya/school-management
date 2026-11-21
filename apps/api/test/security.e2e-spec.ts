import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import request from 'supertest';
import { ACCESS_RULE_KEY, type AccessRule } from '../src/common/decorators/access.decorators.js';
import { API, createTestApp, resetDatabase, type TestContext } from './helpers.js';

interface Route {
  method: string;
  path: string;
  rule: AccessRule | undefined;
  handler: string;
}

/** Every route the API serves, read from the controllers' metadata. */
function allRoutes(ctx: TestContext): Route[] {
  const scanner = new MetadataScanner();
  const reflector = new Reflector();
  const routes: Route[] = [];
  const controllers = [...ctx.app.get(ModulesContainer).values()].flatMap((m) => [
    ...m.controllers.values(),
  ]);
  for (const wrapper of controllers) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const base = (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? '';
    const proto = Object.getPrototypeOf(instance) as object;
    for (const name of scanner.getAllMethodNames(proto)) {
      const fn = (proto as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
      const path = Reflect.getMetadata(PATH_METADATA, fn) as string | undefined;
      if (path === undefined) continue;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as number];
      const rule = reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE_KEY, [
        fn,
        metatype,
      ]);
      const full = `/${[base, path].filter((p) => p && p !== '/').join('/')}`.replace(/\/+/g, '/');
      routes.push({ method, path: full, rule, handler: `${metatype.name}.${name}` });
    }
  }
  return routes;
}

/** The only routes anyone may call without signing in. Changing this list needs a review. */
const PUBLIC_ROUTES = [
  'GET /health/live',
  'GET /health/ready',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'POST /public/enquiries',
  'POST /public/contact-messages',
].sort();

describe('API security (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('declares an access rule on every route (deny by default)', () => {
    const missing = allRoutes(ctx)
      .filter((r) => !r.rule)
      .map((r) => r.handler);
    expect(missing).toEqual([]);
  });

  it('keeps the public surface to the reviewed list (plus read-only public website routes)', () => {
    const publicRoutes = allRoutes(ctx)
      .filter((r) => r.rule?.type === 'public')
      .map((r) => `${r.method} ${r.path}`);
    // Website content for visitors: read-only GETs under /public.
    const unexpected = publicRoutes.filter(
      (r) => !PUBLIC_ROUTES.includes(r) && !r.startsWith('GET /public/'),
    );
    expect(unexpected).toEqual([]);
    expect(publicRoutes.filter((r) => !r.startsWith('GET /public/')).sort()).toEqual(PUBLIC_ROUTES);
  });

  it('refuses every non-public route without a token', async () => {
    const id = '0190a3c4-0000-7000-8000-000000000000';
    const protectedRoutes = allRoutes(ctx).filter((r) => r.rule && r.rule.type !== 'public');
    expect(protectedRoutes.length).toBeGreaterThan(150);
    const failures: string[] = [];
    for (const r of protectedRoutes) {
      const url =
        API +
        r.path.replace(/:[A-Za-z]+/g, (m) => (m === ':type' || m === ':key' ? 'students' : id));
      const res = await request(ctx.http)[r.method.toLowerCase() as 'get'](url);
      if (res.status !== 401) failures.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('sends security headers and does not echo unknown CORS origins', async () => {
    const res = await request(ctx.http)
      .get(`${API}/health/live`)
      .set('Origin', 'https://evil.example');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects tampered and expired-looking tokens', async () => {
    await request(ctx.http)
      .get(`${API}/auth/me`)
      .set('Authorization', 'Bearer abc.def.ghi')
      .expect(401);
    await request(ctx.http)
      .get(`${API}/auth/me`)
      .set('Authorization', 'Basic YWRtaW46YWRtaW4=')
      .expect(401);
  });
});
