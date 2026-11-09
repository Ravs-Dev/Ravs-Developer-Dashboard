import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncryptedCookieSession } from '../server/cookie-session.js';

const SECRET = 's'.repeat(64);

function invoke(cookieHeader = '', options = {}) {
  const cookies = [];
  const req = { headers: cookieHeader ? { cookie: cookieHeader } : {} };
  const res = {
    append(name, value) {
      if (name.toLowerCase() !== 'set-cookie') return;
      if (Array.isArray(value)) cookies.push(...value);
      else cookies.push(value);
    },
  };
  let called = false;
  createEncryptedCookieSession({
    secret: SECRET,
    secure: true,
    maxAgeMs: options.maxAgeMs ?? 60_000,
  })(req, res, () => { called = true; });
  assert.equal(called, true);
  return { req, cookies };
}

test('encrypted cookie session round-trips data and sets secure HttpOnly attributes', () => {
  const first = invoke();
  first.req.session.user = { login: 'Ravs-Dev' };
  first.req.session.encryptedAccessToken = 'encrypted-token-placeholder';

  let saveError;
  first.req.session.save((error) => { saveError = error; });
  assert.equal(saveError, null);
  assert.equal(first.cookies.length, 1);
  assert.match(first.cookies[0], /HttpOnly/);
  assert.match(first.cookies[0], /Secure/);
  assert.match(first.cookies[0], /SameSite=Lax/);

  const cookiePair = first.cookies[0].split(';')[0];
  const second = invoke(cookiePair);
  assert.deepEqual(second.req.session.user, { login: 'Ravs-Dev' });
  assert.equal(second.req.session.encryptedAccessToken, 'encrypted-token-placeholder');
});

test('tampered encrypted session cookies are rejected', () => {
  const first = invoke();
  first.req.session.user = { login: 'Ravs-Dev' };
  first.req.session.save(() => {});
  const [name, value] = first.cookies[0].split(';')[0].split('=');
  const [iv, tag, data] = value.split('.');
  const changedTag = Buffer.from(tag, 'base64url');
  changedTag[0] ^= 0x01;
  const tampered = `${iv}.${changedTag.toString('base64url')}.${data}`;

  const second = invoke(`${name}=${tampered}`);
  assert.equal(second.req.session.user, undefined);
});

test('regenerate clears previous data and destroy expires the cookie', () => {
  const session = invoke();
  session.req.session.user = { login: 'old-user' };
  session.req.session.regenerate((error) => assert.equal(error, null));
  assert.equal(session.req.session.user, undefined);

  session.req.session.destroy((error) => assert.equal(error, null));
  assert.equal(session.cookies.length, 1);
  assert.match(session.cookies[0], /Max-Age=0/);
});
