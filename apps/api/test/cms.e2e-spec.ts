import request from 'supertest';
import {
  ADMIN,
  API,
  TEACHER,
  bearer,
  createTestApp,
  login,
  resetDatabase,
  type TestContext,
} from './helpers.js';

/** A valid 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86_400_000;

describe('CMS & public website (e2e)', () => {
  let ctx: TestContext;
  let admin: string;
  let teacher: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = (await login(ctx.http, ADMIN.email, ADMIN.password)).token;
    teacher = (await login(ctx.http, TEACHER.email, TEACHER.password)).token;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const upload = (
    token: string,
    buffer: Buffer,
    filename: string,
    fields: Record<string, string> = {},
  ) => {
    let req = request(ctx.http).post(`${API}/media`).set(bearer(token));
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('file', buffer, { filename, contentType: 'image/png' });
  };

  describe('website pages', () => {
    it('serves seeded published content publicly and blocks staff without permission', async () => {
      const home = await request(ctx.http).get(`${API}/public/pages/home`).expect(200);
      expect(home.body.heroSlides[0].highlight).toBe('Bright Futures');
      const site = await request(ctx.http).get(`${API}/public/pages/site`).expect(200);
      expect(site.body.schoolName).toBe('Rajasthan Public School');
      await request(ctx.http).get(`${API}/website-pages`).set(bearer(teacher)).expect(403);
      await request(ctx.http).get(`${API}/public/pages/nope`).expect(400);
    });

    it('keeps drafts private until published', async () => {
      const page = await request(ctx.http)
        .get(`${API}/website-pages/admissions`)
        .set(bearer(admin))
        .expect(200);
      const content = { ...page.body.content, intro: 'New intro text for 2027' };

      const saved = await request(ctx.http)
        .put(`${API}/website-pages/admissions`)
        .set(bearer(admin))
        .send({ content })
        .expect(200);
      expect(saved.body.hasUnpublishedChanges).toBe(true);
      const live = await request(ctx.http).get(`${API}/public/pages/admissions`).expect(200);
      expect(live.body.intro).not.toBe('New intro text for 2027');

      const published = await request(ctx.http)
        .post(`${API}/website-pages/admissions/publish`)
        .set(bearer(admin))
        .expect(200);
      expect(published.body.hasUnpublishedChanges).toBe(false);
      const after = await request(ctx.http).get(`${API}/public/pages/admissions`).expect(200);
      expect(after.body.intro).toBe('New intro text for 2027');
    });

    it('validates content against the page schema', async () => {
      const res = await request(ctx.http)
        .put(`${API}/website-pages/home`)
        .set(bearer(admin))
        .send({ content: { heroSlides: [], highlights: [], about: {}, stats: [] } })
        .expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'content.heroSlides: Add at least one slide',
          expect.stringMatching(/^content\.about\.heading:/),
        ]),
      );
    });
  });

  describe('announcements', () => {
    it('only shows published announcements inside their visibility window', async () => {
      const create = (title: string, extra: object) =>
        request(ctx.http)
          .post(`${API}/announcements`)
          .set(bearer(admin))
          .send({ title, body: 'Details', ...extra })
          .expect(201);

      await create('Draft note', {});
      await create('Live now', { status: 'PUBLISHED' });
      await create('Scheduled', { status: 'PUBLISHED', publishAt: iso(DAY) });
      await create('Expired', {
        status: 'PUBLISHED',
        publishAt: iso(-3 * DAY),
        expiresAt: iso(-DAY),
      });

      const pub = await request(ctx.http).get(`${API}/public/announcements`).expect(200);
      expect(pub.body.map((a: { title: string }) => a.title)).toEqual(['Live now']);
      expect(pub.body[0]).toMatchObject({ slug: 'live-now', isNew: true });
      await request(ctx.http).get(`${API}/public/announcements/draft-note`).expect(404);
      await request(ctx.http).get(`${API}/public/announcements/live-now`).expect(200);
    });

    it('generates unique slugs and validates the window', async () => {
      const a = await request(ctx.http)
        .post(`${API}/announcements`)
        .set(bearer(admin))
        .send({ title: 'Holiday Notice', body: 'x' })
        .expect(201);
      const b = await request(ctx.http)
        .post(`${API}/announcements`)
        .set(bearer(admin))
        .send({ title: 'Holiday Notice', body: 'y' })
        .expect(201);
      expect(a.body.slug).toBe('holiday-notice');
      expect(b.body.slug).toMatch(/^holiday-notice-[0-9a-f]{6}$/);

      const bad = await request(ctx.http)
        .post(`${API}/announcements`)
        .set(bearer(admin))
        .send({ title: 'Bad window', body: 'x', publishAt: iso(DAY), expiresAt: iso(0) })
        .expect(400);
      expect(bad.body.message).toEqual(['expiresAt: Expiry must be after the publish time']);
      await request(ctx.http).get(`${API}/announcements`).set(bearer(teacher)).expect(403);
    });
  });

  describe('events', () => {
    it('lists upcoming and past public events, hiding drafts and flagging cancellations', async () => {
      const create = (title: string, startsAt: string, status: string) =>
        request(ctx.http)
          .post(`${API}/events`)
          .set(bearer(admin))
          .send({ title, startsAt, status, venue: 'School Ground' })
          .expect(201);
      await create('Sports Day', iso(5 * DAY), 'PUBLISHED');
      await create('Science Fair', iso(2 * DAY), 'PUBLISHED');
      await create('Secret Planning', iso(3 * DAY), 'DRAFT');
      await create('Picnic', iso(4 * DAY), 'CANCELLED');
      await create('Annual Function', iso(-30 * DAY), 'PUBLISHED');

      const upcoming = await request(ctx.http)
        .get(`${API}/public/events?when=upcoming`)
        .expect(200);
      expect(upcoming.body.map((e: { title: string }) => e.title)).toEqual([
        'Science Fair',
        'Picnic',
        'Sports Day',
      ]);
      expect(upcoming.body[1].status).toBe('CANCELLED');
      const past = await request(ctx.http).get(`${API}/public/events?when=past`).expect(200);
      expect(past.body.map((e: { title: string }) => e.title)).toEqual(['Annual Function']);
    });

    it('rejects an end time before the start', async () => {
      const res = await request(ctx.http)
        .post(`${API}/events`)
        .set(bearer(admin))
        .send({ title: 'Backwards', startsAt: iso(DAY), endsAt: iso(0) })
        .expect(400);
      expect(res.body.message).toEqual(['endsAt: End must be after the start']);
    });
  });

  describe('media library', () => {
    it('uploads an image and serves it publicly', async () => {
      const res = await upload(admin, PNG, 'sports.png', {
        category: 'SPORTS',
        title: 'Sports day',
      }).expect(201);
      expect(res.body).toMatchObject({ category: 'SPORTS', mimeType: 'image/png', isPublic: true });

      const file = await request(ctx.http).get(res.body.url).expect(200);
      expect(file.headers['content-type']).toBe('image/png');
      expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);

      const gallery = await request(ctx.http)
        .get(`${API}/public/gallery?category=SPORTS`)
        .expect(200);
      expect(gallery.body).toHaveLength(1);
    });

    it('rejects files that are not real images, whatever their name or type', async () => {
      const fake = await upload(admin, Buffer.from('<script>alert(1)</script>'), 'evil.png').expect(
        400,
      );
      expect(fake.body.message).toEqual(['file: Only JPEG, PNG or WebP images are allowed']);
      await upload(teacher, PNG, 'x.png').expect(403);
    });

    it('hides non-public images from visitors but not from staff', async () => {
      const res = await upload(admin, PNG, 'staff-only.png', { isPublic: 'false' }).expect(201);
      await request(ctx.http).get(res.body.url).expect(404);
      await request(ctx.http)
        .get(`${API}/media/${res.body.id}/file`)
        .set(bearer(admin))
        .expect(200);
    });

    it('protects images that website pages use', async () => {
      const img = await upload(admin, PNG, 'hero.png', { category: 'BANNER' }).expect(201);
      const page = await request(ctx.http).get(`${API}/website-pages/home`).set(bearer(admin));
      const content = page.body.content;
      content.heroSlides[0].imageId = img.body.id;
      await request(ctx.http)
        .put(`${API}/website-pages/home`)
        .set(bearer(admin))
        .send({ content })
        .expect(200);
      await request(ctx.http)
        .post(`${API}/website-pages/home/publish`)
        .set(bearer(admin))
        .expect(200);

      const del = await request(ctx.http)
        .delete(`${API}/media/${img.body.id}`)
        .set(bearer(admin))
        .expect(409);
      expect(del.body.message).toMatch(/Home page/);
      await request(ctx.http)
        .patch(`${API}/media/${img.body.id}`)
        .set(bearer(admin))
        .send({ isPublic: false })
        .expect(409);
    });
  });

  describe('internal notices', () => {
    it('shows each user only the live notices meant for them', async () => {
      const create = (title: string, extra: object) =>
        request(ctx.http)
          .post(`${API}/notices`)
          .set(bearer(admin))
          .send({ title, body: 'x', ...extra })
          .expect(201);
      await create('For everyone', {});
      await create('Teachers meeting', { audienceRoleCode: 'TEACHER' });
      await create('Admins only', { audienceRoleCode: 'ADMIN' });
      await create('Old notice', { expiresAt: iso(-DAY), publishAt: iso(-2 * DAY) });

      const feed = await request(ctx.http)
        .get(`${API}/notices/feed`)
        .set(bearer(teacher))
        .expect(200);
      expect(feed.body.map((n: { title: string }) => n.title).sort()).toEqual([
        'For everyone',
        'Teachers meeting',
      ]);
      await request(ctx.http)
        .post(`${API}/notices`)
        .set(bearer(teacher))
        .send({ title: 'x', body: 'y' })
        .expect(403);
      await request(ctx.http)
        .post(`${API}/notices`)
        .set(bearer(admin))
        .send({ title: 'Wrong role', body: 'y', audienceRoleCode: 'NOPE' })
        .expect(400);
    });
  });
});
