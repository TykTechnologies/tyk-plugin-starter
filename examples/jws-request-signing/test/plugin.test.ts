import { test, expect, beforeEach } from 'vitest';
import * as CryptoJS from 'crypto-js';
import { runHook, mockRequest, mockSession, mockConfig, resetAll } from '../../../test/_harness';
import '../src/plugin';

const SECRET = 'test-secret-1234';

beforeEach(() => {
  resetAll();
});

test('signs the request body and sets X-Signature in JWS compact form', () => {
  const req = mockRequest({ Body: '{"hello":"world"}', Method: 'POST' });

  const result = runHook(
    'pre',
    req,
    mockSession(),
    mockConfig({ config_data: { jws_secret: SECRET } })
  );

  const sig = result.Request.SetHeaders['X-Signature'];
  expect(sig).toBeDefined();

  const parts = sig.split('.');
  expect(parts).toHaveLength(3);

  const headerJson = Buffer.from(parts[0], 'base64url').toString('utf8');
  expect(JSON.parse(headerJson)).toEqual({ alg: 'HS256', typ: 'JWS' });

  const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf8');
  expect(payloadStr).toBe('{"hello":"world"}');
});

test('signature is deterministic for the same secret and body', () => {
  const cfg = mockConfig({ config_data: { jws_secret: SECRET } });

  const r1 = runHook('pre', mockRequest({ Body: 'same-body' }), mockSession(), cfg);
  const r2 = runHook('pre', mockRequest({ Body: 'same-body' }), mockSession(), cfg);

  expect(r1.Request.SetHeaders['X-Signature']).toBe(r2.Request.SetHeaders['X-Signature']);
});

test('different bodies produce different signatures', () => {
  const cfg = mockConfig({ config_data: { jws_secret: SECRET } });

  const r1 = runHook('pre', mockRequest({ Body: 'body-one' }), mockSession(), cfg);
  const r2 = runHook('pre', mockRequest({ Body: 'body-two' }), mockSession(), cfg);

  expect(r1.Request.SetHeaders['X-Signature']).not.toBe(r2.Request.SetHeaders['X-Signature']);
});

test('signature matches an independent HMAC computation', () => {
  const body = '{"order":"abc-123"}';

  const result = runHook(
    'pre',
    mockRequest({ Body: body }),
    mockSession(),
    mockConfig({ config_data: { jws_secret: SECRET } })
  );

  const sig = result.Request.SetHeaders['X-Signature'];
  const [headerB64, payloadB64, sigB64] = sig.split('.');

  const expected = CryptoJS.HmacSHA256(headerB64 + '.' + payloadB64, SECRET)
    .toString(CryptoJS.enc.Base64)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  expect(sigB64).toBe(expected);
});

test('rejects with 500 when jws_secret is missing', () => {
  const result = runHook('pre', mockRequest({ Body: 'x' }), mockSession(), mockConfig());

  expect(result.Request.ReturnOverrides.ResponseCode).toBe(500);
  expect(result.Request.ReturnOverrides.OverrideError).toBe(true);
  expect(result.Request.SetHeaders['X-Signature']).toBeUndefined();
});
