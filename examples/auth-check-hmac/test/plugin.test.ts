import { test, expect, beforeEach } from 'vitest';
import * as CryptoJS from 'crypto-js';
import { runHook, mockRequest, mockSession, mockConfig, resetAll } from '../../../test/_harness';
import '../src/plugin';

const SECRET = 'test-secret-1234';

function sign(method: string, url: string, body: string, secret: string = SECRET): string {
  return CryptoJS.HmacSHA256(method + url + body, secret).toString(CryptoJS.enc.Hex);
}

beforeEach(() => {
  resetAll();
});

test('valid signature passes auth and attaches an hmac-tagged session', () => {
  const method = 'POST';
  const url = '/orders';
  const body = '{"item":"widget"}';
  const sig = sign(method, url, body);

  const req = mockRequest({
    Method: method,
    URL: url,
    Body: body,
    Headers: { 'X-Signature': [sig] },
  });

  const result = runHook(
    'auth_check',
    req,
    mockSession(),
    mockConfig({ config_data: { hmac_secret: SECRET } })
  );

  expect(result.Request.ReturnOverrides.ResponseCode).toBe(0);
  expect(result.Request.ReturnOverrides.OverrideError).toBe(false);
  expect(result.Session).toBeDefined();
  expect(result.Session.meta_data.auth_method).toBe('hmac');
});

test('wrong signature is rejected with 401 and OverrideError', () => {
  const req = mockRequest({
    Method: 'POST',
    URL: '/orders',
    Body: '{"item":"widget"}',
    Headers: { 'X-Signature': ['deadbeef-not-a-real-signature'] },
  });

  const result = runHook(
    'auth_check',
    req,
    mockSession(),
    mockConfig({ config_data: { hmac_secret: SECRET } })
  );

  expect(result.Request.ReturnOverrides.ResponseCode).toBe(401);
  expect(result.Request.ReturnOverrides.ResponseError).toBe('invalid signature');
  expect(result.Request.ReturnOverrides.OverrideError).toBe(true);
});

test('missing X-Signature header is rejected with 401', () => {
  const req = mockRequest({
    Method: 'POST',
    URL: '/orders',
    Body: '{"item":"widget"}',
    Headers: {},
  });

  const result = runHook(
    'auth_check',
    req,
    mockSession(),
    mockConfig({ config_data: { hmac_secret: SECRET } })
  );

  expect(result.Request.ReturnOverrides.ResponseCode).toBe(401);
  expect(result.Request.ReturnOverrides.ResponseError).toBe('missing X-Signature');
  expect(result.Request.ReturnOverrides.OverrideError).toBe(true);
});

test('missing config.config_data.hmac_secret rejects with 500', () => {
  const req = mockRequest({
    Method: 'GET',
    URL: '/orders',
    Headers: { 'X-Signature': ['anything'] },
  });

  const result = runHook('auth_check', req, mockSession(), mockConfig());

  expect(result.Request.ReturnOverrides.ResponseCode).toBe(500);
  expect(result.Request.ReturnOverrides.ResponseError).toBe('hmac_secret not configured');
  expect(result.Request.ReturnOverrides.OverrideError).toBe(true);
});

test('different methods, URLs, and bodies produce different expected signatures', () => {
  const a = sign('GET', '/orders', '');
  const b = sign('POST', '/orders', '');
  const c = sign('GET', '/items', '');
  const d = sign('GET', '/orders', 'x');

  // Sanity: each component flips the digest.
  expect(a).not.toBe(b);
  expect(a).not.toBe(c);
  expect(a).not.toBe(d);

  // And the plugin only accepts the matching one for each.
  const cfg = mockConfig({ config_data: { hmac_secret: SECRET } });

  const okGet = runHook(
    'auth_check',
    mockRequest({ Method: 'GET', URL: '/orders', Body: '', Headers: { 'X-Signature': [a] } }),
    mockSession(),
    cfg
  );
  expect(okGet.Request.ReturnOverrides.ResponseCode).toBe(0);

  // Reusing a GET signature on a POST must fail.
  const wrongMethod = runHook(
    'auth_check',
    mockRequest({ Method: 'POST', URL: '/orders', Body: '', Headers: { 'X-Signature': [a] } }),
    mockSession(),
    cfg
  );
  expect(wrongMethod.Request.ReturnOverrides.ResponseCode).toBe(401);
});
