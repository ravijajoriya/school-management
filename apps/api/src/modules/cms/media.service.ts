import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  MEDIA_MAX_BYTES,
  PAGE_LABELS,
  type ListMediaQuery,
  type MediaCategory,
  type MediaItem,
  type Paginated,
  type PageKey,
  type PublicMedia,
  type UpdateMediaInput,
  type UploadMediaInput,
} from '@school/shared';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { paginated, schoolDate } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';

export interface UploadedFile {
  buffer: Buffer;
  size: number;
  originalname: string;
}

const include = { uploader: { select: { id: true, fullName: true } } } as const;
type Row = Prisma.MediaAssetGetPayload<{ include: typeof include }>;

export const publicMediaUrl = (id: string) => `/api/v1/public/media/${id}`;

function toItem(r: Row): MediaItem {
  return {
    id: r.id,
    title: r.title,
    category: (r.category ?? 'GENERAL') as MediaCategory,
    mimeType: r.mimeType,
    fileSizeBytes: Number(r.fileSizeBytes),
    altText: r.altText,
    isPublic: r.isPublic,
    url: publicMediaUrl(r.id),
    createdAt: r.createdAt.toISOString(),
    uploadedBy: r.uploader,
  };
}

/** Detects the real image type from the file's first bytes; the client-sent MIME type is ignored. */
export function sniffImageType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListMediaQuery): Promise<Paginated<MediaItem>> {
    const where: Prisma.MediaAssetWhereInput = {
      category: query.category,
      isPublic: query.publicOnly ? true : undefined,
      OR: query.search
        ? [
            { title: { contains: query.search, mode: 'insensitive' } },
            { altText: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.mediaAsset.count({ where }),
      this.prisma.mediaAsset.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return paginated(rows.map(toItem), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<MediaItem> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Image not found');
    return toItem(row);
  }

  async upload(
    file: UploadedFile | undefined,
    input: UploadMediaInput & { category: MediaCategory; isPublic: boolean },
    actor: RequestUser,
    context: RequestContext,
  ): Promise<MediaItem> {
    if (!file?.buffer?.length) throw new BadRequestException(['file: Choose an image to upload']);
    if (file.size > MEDIA_MAX_BYTES)
      throw new BadRequestException(['file: Image must be 5 MB or smaller']);
    const type = sniffImageType(file.buffer);
    if (!type) throw new BadRequestException(['file: Only JPEG, PNG or WebP images are allowed']);

    const [year, month] = schoolDate().split('-');
    const storageKey = `media/${year}/${month}/${randomUUID()}.${type.ext}`;
    await this.storage.put(storageKey, file.buffer);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = toItem(
          await tx.mediaAsset.create({
            data: {
              title: input.title || file.originalname.replace(/\.[^.]+$/, '').slice(0, 160) || null,
              category: input.category,
              storageKey,
              mimeType: type.mime,
              fileSizeBytes: BigInt(file.size),
              altText: input.altText || null,
              isPublic: input.isPublic,
              uploadedBy: actor.id,
            },
            include,
          }),
        );
        await this.audit.log(
          {
            action: AUDIT_ACTIONS.MEDIA_UPLOADED,
            entityType: 'media_asset',
            entityId: item.id,
            userId: actor.id,
            after: {
              title: item.title,
              category: item.category,
              isPublic: item.isPublic,
              size: file.size,
            },
            context,
          },
          tx,
        );
        return item;
      });
    } catch (error) {
      await this.storage.delete(storageKey); // don't leave orphan files behind
      throw error;
    }
  }

  async update(id: string, input: UpdateMediaInput, actor: RequestUser, context: RequestContext) {
    const before = await this.get(id);
    if (input.isPublic === false && before.isPublic) {
      const pages = await this.pagesUsing(id);
      if (pages.length) {
        throw new ConflictException(
          `This image is used on: ${pages.join(', ')}. Replace it there first.`,
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const item = toItem(
        await tx.mediaAsset.update({
          where: { id },
          data: {
            title: input.title,
            category: input.category,
            altText: input.altText,
            isPublic: input.isPublic,
          },
          include,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.MEDIA_UPDATED,
          entityType: 'media_asset',
          entityId: id,
          userId: actor.id,
          before: { title: before.title, category: before.category, isPublic: before.isPublic },
          after: { title: item.title, category: item.category, isPublic: item.isPublic },
          context,
        },
        tx,
      );
      return item;
    });
  }

  async remove(id: string, actor: RequestUser, context: RequestContext): Promise<void> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Image not found');
    const pages = await this.pagesUsing(id);
    if (pages.length) {
      throw new ConflictException(
        `This image is used on: ${pages.join(', ')}. Replace it there first.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.delete({ where: { id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.MEDIA_DELETED,
          entityType: 'media_asset',
          entityId: id,
          userId: actor.id,
          before: { title: row.title, category: row.category, storageKey: row.storageKey },
          context,
        },
        tx,
      );
    });
    await this.storage.delete(row.storageKey);
  }

  /** Opens the file; `requirePublic` hides non-public images from anonymous visitors. */
  async openFile(id: string, requirePublic: boolean) {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!row || (requirePublic && !row.isPublic)) throw new NotFoundException('Image not found');
    const file = await this.storage.read(row.storageKey);
    if (!file) throw new NotFoundException('Image file is missing');
    return { ...file, mimeType: row.mimeType };
  }

  async listPublicGallery(category: string | undefined, limit: number): Promise<PublicMedia[]> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        isPublic: true,
        category: category ?? { in: ['ACADEMIC', 'SPORTS', 'EVENTS', 'ACTIVITIES', 'CAMPUS'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: (r.category ?? 'GENERAL') as MediaCategory,
      altText: r.altText,
      url: publicMediaUrl(r.id),
    }));
  }

  /** Website pages whose draft or live content references this image. */
  private async pagesUsing(id: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ page_key: string }[]>`
      SELECT page_key FROM website_pages
      WHERE content_json::text LIKE ${'%' + id + '%'}
         OR published_content_json::text LIKE ${'%' + id + '%'}
      ORDER BY page_key`;
    return rows.map((r) => PAGE_LABELS[r.page_key as PageKey] ?? r.page_key);
  }
}
