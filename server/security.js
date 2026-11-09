import crypto from 'node:crypto';

export function generatePkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getEncryptionKey(rawKey) {
  if (!rawKey) throw new Error('TOKEN_ENCRYPTION_KEY is required.');
  const key = /^[a-f0-9]{64}$/i.test(rawKey)
    ? Buffer.from(rawKey, 'hex')
    : Buffer.from(rawKey, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters or base64).');
  }
  return key;
}

export function encryptSecret(plainText, rawKey) {
  if (typeof plainText !== 'string' || !plainText) throw new Error('A non-empty secret is required.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(rawKey), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(payload, rawKey) {
  if (typeof payload !== 'string') throw new Error('Encrypted secret is invalid.');
  const [ivPart, tagPart, dataPart, extra] = payload.split('.');
  if (!ivPart || !tagPart || dataPart === undefined || extra !== undefined) {
    throw new Error('Encrypted secret has an invalid format.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(rawKey), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
