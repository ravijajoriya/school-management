import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DOCUMENT_MAX_BYTES } from '@school/shared';
import { randomUUID } from 'node:crypto';
import { StorageService } from './storage.service.js';

export interface UploadedFile {
  buffer: Buffer;
  size: number;
  originalname: string;
}

type Kind = 'document' | 'photo';

/** Detects the real file type from its first bytes; the client-sent MIME type is ignored. */
export function sniffFileType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-')
    return { mime: 'application/pdf', ext: 'pdf' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
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

const RULES: Record<Kind, { maxBytes: number; mimes: string[]; label: string }> = {
  document: {
    maxBytes: DOCUMENT_MAX_BYTES,
    mimes: ['application/pdf', 'image/jpeg', 'image/png'],
    label: 'PDF, JPEG or PNG',
  },
  photo: {
    maxBytes: 2 * 1024 * 1024,
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
    label: 'JPEG, PNG or WebP',
  },
};

/**
 * Private files (staff/student documents and photos). Stored under `private/…` with generated
 * keys and only ever streamed to signed-in staff with the right permission — never via public URLs.
 */
@Injectable()
export class PrivateFilesService {
  constructor(private readonly storage: StorageService) {}

  /** Validates and stores a file; returns the metadata to save on the owning record. */
  async store(file: UploadedFile | undefined, kind: Kind, folder: string) {
    const rule = RULES[kind];
    if (!file?.buffer?.length) throw new BadRequestException(['file: Choose a file to upload']);
    if (file.size > rule.maxBytes) {
      throw new BadRequestException([
        `file: File must be ${rule.maxBytes / 1024 / 1024} MB or smaller`,
      ]);
    }
    const type = sniffFileType(file.buffer);
    if (!type || !rule.mimes.includes(type.mime)) {
      throw new BadRequestException([`file: Only ${rule.label} files are allowed`]);
    }
    const storageKey = `private/${folder}/${randomUUID()}.${type.ext}`;
    await this.storage.put(storageKey, file.buffer);
    return {
      storageKey,
      mimeType: type.mime,
      fileSizeBytes: BigInt(file.size),
      // Keep a readable, safe file name for downloads.
      fileName: (file.originalname || `file.${type.ext}`).replace(/[^\w.\- ]+/g, '_').slice(0, 200),
    };
  }

  async open(storageKey: string) {
    const file = await this.storage.read(storageKey);
    if (!file) throw new NotFoundException('File is missing');
    return file;
  }

  remove(storageKey: string) {
    return this.storage.delete(storageKey);
  }
}
