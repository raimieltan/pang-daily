import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

function derive(password: string, salt: Buffer, legacy = false): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: legacy ? 16384 : 32768, r: 8, p: legacy ? 1 : 3, maxmem: 64 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt-v2$${salt.toString('hex')}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string | undefined): Promise<boolean> {
  const match = encoded?.match(/^scrypt-v([12])\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
  // Unknown users still incur the password derivation work.
  const derived = await derive(password, match ? Buffer.from(match[2], 'hex') : Buffer.alloc(16), match?.[1] === '1');
  const expected = match ? Buffer.from(match[3], 'hex') : Buffer.alloc(64);
  return timingSafeEqual(derived, expected) && !!match;
}
