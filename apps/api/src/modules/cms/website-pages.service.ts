import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  PAGE_CONTENT_SCHEMAS,
  type PageContentMap,
  type PageKey,
  type PageStatus,
  type SavePageDraftInput,
  type WebsitePageItem,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { collectImageIds, stableStringify } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';

type PageRow = Prisma.WebsitePageGetPayload<{
  include: { editor: { select: { id: true; fullName: true } } };
}>;

function toItem<K extends PageKey>(row: PageRow): WebsitePageItem<K> {
  const content = row.contentJson as unknown as PageContentMap[K];
  const published = (row.publishedContentJson ?? null) as unknown as PageContentMap[K] | null;
  return {
    pageKey: row.pageKey as K,
    title: row.title,
    status: row.status as PageStatus,
    content,
    publishedContent: published,
    hasUnpublishedChanges: !published || stableStringify(content) !== stableStringify(published),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.editor,
  };
}

@Injectable()
export class WebsitePagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<WebsitePageItem[]> {
    const rows = await this.prisma.websitePage.findMany({
      include: { editor: { select: { id: true, fullName: true } } },
      orderBy: { pageKey: 'asc' },
    });
    return rows.map((r) => toItem(r));
  }

  async get<K extends PageKey>(key: K): Promise<WebsitePageItem<K>> {
    const row = await this.prisma.websitePage.findUnique({
      where: { pageKey: key },
      include: { editor: { select: { id: true, fullName: true } } },
    });
    if (!row) throw new NotFoundException('Page not found. Run the database seed to create it.');
    return toItem<K>(row);
  }

  /** Saves the working draft. The live site is unchanged until the page is published. */
  async saveDraft(
    key: PageKey,
    input: SavePageDraftInput,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<WebsitePageItem> {
    const before = await this.get(key);
    const parsed = PAGE_CONTENT_SCHEMAS[key].safeParse(input.content);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `content.${i.path.join('.')}: ${i.message}`),
      );
    }
    const content = parsed.data as Prisma.InputJsonValue;
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.websitePage.update({
        where: { pageKey: key },
        data: { contentJson: content, title: input.title ?? undefined, updatedBy: actor.id },
        include: { editor: { select: { id: true, fullName: true } } },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.PAGE_SAVED,
          entityType: 'website_page',
          entityId: row.id,
          userId: actor.id,
          before: { title: before.title, content: before.content },
          after: { title: row.title, content },
          context,
        },
        tx,
      );
      return toItem(row);
    });
  }

  /** Makes the current draft live. Every referenced image must exist and be public. */
  async publish(
    key: PageKey,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<WebsitePageItem> {
    const page = await this.get(key);
    await this.assertImagesPublic(page.content);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.websitePage.update({
        where: { pageKey: key },
        data: {
          publishedContentJson: page.content as Prisma.InputJsonValue,
          publishedAt: new Date(),
          status: 'PUBLISHED',
          updatedBy: actor.id,
        },
        include: { editor: { select: { id: true, fullName: true } } },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.PAGE_PUBLISHED,
          entityType: 'website_page',
          entityId: row.id,
          userId: actor.id,
          before: { content: page.publishedContent },
          after: { content: page.content },
          context,
        },
        tx,
      );
      return toItem(row);
    });
  }

  /** Live content for the public site (404 if the page has never been published). */
  async getPublished<K extends PageKey>(key: K): Promise<PageContentMap[K]> {
    const row = await this.prisma.websitePage.findUnique({
      where: { pageKey: key },
      select: { publishedContentJson: true },
    });
    if (!row?.publishedContentJson) throw new NotFoundException('Page not found');
    return row.publishedContentJson as unknown as PageContentMap[K];
  }

  private async assertImagesPublic(content: unknown) {
    const ids = [...collectImageIds(content)];
    if (!ids.length) return;
    const found = await this.prisma.mediaAsset.findMany({
      where: { id: { in: ids }, isPublic: true },
      select: { id: true },
    });
    const ok = new Set(found.map((m) => m.id));
    const bad = ids.filter((id) => !ok.has(id));
    if (bad.length) {
      throw new BadRequestException(
        `This page uses ${bad.length} image(s) that were deleted or hidden. Replace them before publishing.`,
      );
    }
  }
}
