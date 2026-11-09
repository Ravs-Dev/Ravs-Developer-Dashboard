import crypto from 'node:crypto';
import { decryptSecret, encryptSecret } from './security.js';

function deriveCookieKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

/**
 * Stateless, authenticated-encryption session storage for serverless deployments.
 * Session contents are AES-256-GCM encrypted and authenticated before being
 * placed in an HttpOnly cookie. No shared filesystem or database is required.
 */
export function createEncryptedCookieSession({
  name = 'ravs.sid',
  secret,
  maxAgeMs = 7 * 24 * 60 * 60 * 1000,
  secure = false,
} = {}) {
  const key = deriveCookieKey(secret);
  const maxAgeSeconds = Math.max(60, Math.floor(maxAgeMs / 1000));

  return (req, res, next) => {
    let sessionData = {};
    const cookie = readCookie(req, name);

    if (cookie) {
      try {
        const decoded = JSON.parse(decryptSecret(cookie, key));
        if (
          decoded
          && Number.isFinite(decoded.expiresAt)
          && decoded.expiresAt > Date.now()
          && decoded.data
          && typeof decoded.data === 'object'
          && !Array.isArray(decoded.data)
        ) {
          sessionData = decoded.data;
        }
      } catch {
        // Invalid, expired, or tampered cookies are treated as unauthenticated.
      }
    }

    const cookieFlags = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
    if (secure) cookieFlags.push('Secure');

    function saveSession(data, callback) {
      try {
        const payload = JSON.stringify({
          expiresAt: Date.now() + maxAgeMs,
          data,
        });
        const encrypted = encryptSecret(payload, key);
        if (Buffer.byteLength(encrypted, 'utf8') > 3800) {
          throw new Error('Session data is too large for a browser cookie.');
        }
        res.append('Set-Cookie', [
          `${name}=${encrypted}`,
          ...cookieFlags,
          `Max-Age=${maxAgeSeconds}`,
        ].join('; '));
        callback?.(null);
      } catch (error) {
        callback?.(error);
      }
    }

    function clearSession(callback) {
      for (const property of Object.keys(sessionData)) delete sessionData[property];
      res.append('Set-Cookie', [
        `${name}= `.trimEnd(),
        ...cookieFlags,
        'Max-Age=0',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      ].join('; '));
      callback?.(null);
    }

    req.session = new Proxy(sessionData, {
      get(target, property, receiver) {
        if (property === 'save') return (callback) => saveSession(target, callback);
        if (property === 'regenerate') {
          return (callback) => {
            for (const keyName of Object.keys(target)) delete target[keyName];
            callback?.(null);
          };
        }
        if (property === 'destroy') return (callback) => clearSession(callback);
        return Reflect.get(target, property, receiver);
      },
    });

    next();
  };
}
