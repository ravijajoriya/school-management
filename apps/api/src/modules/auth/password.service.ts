import { Injectable } from '@nestjs/common';
import { argon2, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2);

/** OWASP-recommended Argon2id parameters (19 MiB, 2 passes, 1 lane). */
const PARAMS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;
const SALT_BYTES = 16;

/** Parsed PHC string: $argon2id$v=19$m=19456,t=2,p=1$<salt b64>$<hash b64> */
interface ParsedHash {
  memory: number;
  passes: number;
  parallelism: number;
  salt: Buffer;
  hash: Buffer;
}

const b64 = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '');

function parse(encoded: string): ParsedHash | null {
  const match =
    /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(encoded);
  if (!match) return null;
  return {
    memory: Number(match[1]),
    passes: Number(match[2]),
    parallelism: Number(match[3]),
    salt: Buffer.from(match[4], 'base64'),
    hash: Buffer.from(match[5], 'base64'),
  };
}

/**
 * Password hashing with Argon2id using Node's built-in `crypto.argon2` (no native add-on).
 * Hashes are stored in the standard PHC string format, compatible with other Argon2 libraries.
 */
@Injectable()
export class PasswordService {
  /** A valid hash of a random string; verified against when the user doesn't exist so that
   *  response time does not reveal whether an account exists. */
  private dummyHash?: Promise<string>;

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const hash = await argon2Async('argon2id', { message: password, nonce: salt, ...PARAMS });
    return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(salt)}$${b64(hash)}`;
  }

  async verify(encoded: string, password: string): Promise<boolean> {
    const parsed = parse(encoded);
    if (!parsed) return false;
    const candidate = await argon2Async('argon2id', {
      message: password,
      nonce: parsed.salt,
      memory: parsed.memory,
      passes: parsed.passes,
      parallelism: parsed.parallelism,
      tagLength: parsed.hash.length,
    });
    return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
  }

  /** True when the stored hash uses weaker parameters than the current policy. */
  needsRehash(encoded: string): boolean {
    const parsed = parse(encoded);
    return (
      !parsed ||
      parsed.memory < PARAMS.memory ||
      parsed.passes < PARAMS.passes ||
      parsed.hash.length < PARAMS.tagLength
    );
  }

  /** Burns comparable CPU time when no user matched the login identifier. */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash(randomBytes(16).toString('hex'));
    await this.verify(await this.dummyHash, password);
  }

  /**
   * Generates a readable temporary password that satisfies the policy, e.g. `Kp7m-Xw3r-Tn9q`.
   * Ambiguous characters (0/O, 1/l/I) are excluded.
   */
  generateTemporaryPassword(): string {
    const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const group = () =>
      letters[randomInt(letters.length)] +
      letters[randomInt(letters.length)] +
      digits[randomInt(digits.length)] +
      letters[randomInt(letters.length)];
    return `${group()}-${group()}-${group()}`;
  }
}
