import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptSecret,
  encryptSecret,
  generatePkcePair,
  safeEqual,
} from '../server/security.js';

const KEY = 'a'.repeat(64);

test('PKCE challenge uses S256 and produces a URL-safe verifier', () => {
  const { verifier, challenge } = generatePkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(verifier, challenge);
});

test('safeEqual compares equal strings and rejects mismatched values', () => {
  assert.equal(safeEqual('state-token', 'state-token'), true);
  assert.equal(safeEqual('state-token', 'different'), false);
  assert.equal(safeEqual(undefined, 'state-token'), false);
});

test('AES-256-GCM encrypts and decrypts secrets', () => {
  const encrypted = encryptSecret('gho_example_token', KEY);
  assert.notEqual(encrypted, 'gho_example_token');
  assert.equal(decryptSecret(encrypted, KEY), 'gho_example_token');
});

test('AES-256-GCM rejects tampered payloads', () => {
  const encrypted = encryptSecret('gho_example_token', KEY);
  const [iv, tag, data] = encrypted.split('.');
  const changedTag = Buffer.from(tag, 'base64url');
  changedTag[0] ^= 0x01;
  const changed = `${iv}.${changedTag.toString('base64url')}.${data}`;
  assert.throws(() => decryptSecret(changed, KEY));
});
