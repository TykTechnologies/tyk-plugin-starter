import { test, expect, beforeEach } from 'vitest';
import {
  runHook,
  mockRequest,
  mockSession,
  mockConfig,
  resetAll,
  getLogs,
} from '../../../test/_harness';
import '../src/plugin';

beforeEach(() => {
  resetAll();
});

test('injects X-Trace-Id on every request', () => {
  const result = runHook('pre', mockRequest(), mockSession(), mockConfig());

  expect(result.Request.SetHeaders['X-Trace-Id']).toBeDefined();
  expect(result.Request.SetHeaders['X-Trace-Id']).toMatch(/^[0-9a-f]+-[0-9a-f]+$/);
});

test('overwrites any inbound X-Trace-Id (gateway-controlled, not client)', () => {
  const req = mockRequest({ Headers: { 'X-Trace-Id': ['client-supplied-id'] } });

  const result = runHook('pre', req, mockSession(), mockConfig());

  expect(result.Request.SetHeaders['X-Trace-Id']).not.toBe('client-supplied-id');
});

test('each request gets a distinct id', () => {
  const a = runHook('pre', mockRequest(), mockSession(), mockConfig())
    .Request.SetHeaders['X-Trace-Id'];
  const b = runHook('pre', mockRequest(), mockSession(), mockConfig())
    .Request.SetHeaders['X-Trace-Id'];

  expect(a).not.toBe(b);
});

test('logs the injected trace id', () => {
  runHook('pre', mockRequest(), mockSession(), mockConfig());

  const logs = getLogs();
  expect(logs.some((l) => l.includes('[pre-trace-id] injected'))).toBe(true);
});
