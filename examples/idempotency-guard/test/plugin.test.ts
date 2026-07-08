import { test, expect, beforeEach, afterEach } from 'vitest';
import {
  runHook,
  mockRequest,
  mockSession,
  mockConfig,
  mockStorage,
  resetAll,
} from '../../../test/_harness';
import '../src/plugin';

const g = globalThis as any;
const realSetNX = g.TykStorageSetNX;

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  g.TykStorageSetNX = realSetNX;
});

function requestWithKey(key: string) {
  return mockRequest({ Method: 'POST', Headers: { 'Idempotency-Key': [key] } });
}

test('no Idempotency-Key header passes through untouched', () => {
  const result = runHook('pre', mockRequest({ Method: 'POST' }), mockSession(), mockConfig());

  expect(result.Request.ReturnOverrides.ResponseCode).toBe(0);
});

test('first request with a key claims it and passes through', () => {
  const result = runHook('pre', requestWithKey('order-123'), mockSession(), mockConfig());

  expect(result.Request.ReturnOverrides.ResponseCode).toBe(0);
  // The claim landed in storage with a TTL.
  expect(mockStorage.get('idem:order-123')).toBe('pending');
  expect(mockStorage.raw('idem:order-123')?.expiresAt).not.toBeNull();
});

test('second request with the same key gets a 409', () => {
  runHook('pre', requestWithKey('order-123'), mockSession(), mockConfig());
  const result = runHook('pre', requestWithKey('order-123'), mockSession(), mockConfig());

  expect(result.Request.ReturnOverrides.ResponseCode).toBe(409);
  expect(result.Request.ReturnOverrides.OverrideError).toBe(true);
  expect(result.Request.ReturnOverrides.ResponseError).toMatch(/duplicate/);
});

test('a different key is a fresh claim and passes through', () => {
  runHook('pre', requestWithKey('order-123'), mockSession(), mockConfig());
  const result = runHook('pre', requestWithKey('order-456'), mockSession(), mockConfig());

  expect(result.Request.ReturnOverrides.ResponseCode).toBe(0);
});

test('storage failure fails closed with a 500', () => {
  g.TykStorageSetNX = () => {
    throw new Error('redis unavailable');
  };

  const result = runHook('pre', requestWithKey('order-123'), mockSession(), mockConfig());

  expect(result.Request.ReturnOverrides.ResponseCode).toBe(500);
  expect(result.Request.ReturnOverrides.OverrideError).toBe(true);
});
