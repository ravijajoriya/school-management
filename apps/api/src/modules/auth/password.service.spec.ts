import { passwordSchema } from '@school/shared';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces an Argon2id PHC string and verifies it', async () => {
    const hash = await service.hash('Correct-Horse-9');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    await expect(service.verify(hash, 'Correct-Horse-9')).resolves.toBe(true);
    await expect(service.verify(hash, 'correct-horse-9')).resolves.toBe(false);
  });

  it('uses a unique salt per hash', async () => {
    const [a, b] = await Promise.all([service.hash('same-pass-1'), service.hash('same-pass-1')]);
    expect(a).not.toBe(b);
  });

  it('rejects malformed hashes instead of throwing', async () => {
    await expect(service.verify('not-a-hash', 'x')).resolves.toBe(false);
    await expect(service.verify('$argon2i$v=19$m=1,t=1,p=1$AAAA$AAAA', 'x')).resolves.toBe(false);
  });

  it('flags hashes made with weaker parameters for rehashing', async () => {
    expect(service.needsRehash(await service.hash('x-pass-123'))).toBe(false);
    expect(service.needsRehash('$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2g')).toBe(true);
  });

  it('generates temporary passwords that satisfy the password policy', () => {
    for (let i = 0; i < 50; i++) {
      const temp = service.generateTemporaryPassword();
      expect(temp).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
      expect(passwordSchema.safeParse(temp).success).toBe(true);
    }
  });
});
