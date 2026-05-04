import { test, expect, beforeEach } from 'vitest';
import { runHook, mockRequest, mockSession, mockConfig, getLogs, resetAll } from './_harness';
import '../src/plugin';

beforeEach(() => {
  resetAll();
});

test('injects X-Trace-Id header on pre-hook', () => {
  const req = mockRequest({ URL: '/api/v1/foo', Method: 'GET' });

  const result = runHook('pre', req, mockSession(), mockConfig());

  expect(result.Request.SetHeaders['X-Trace-Id']).toBeDefined();
  expect(result.Request.SetHeaders['X-Trace-Id']).toMatch(/^[0-9a-f]+-[0-9a-f]+$/);
});

test('logs the trace ID', () => {
  runHook('pre', mockRequest(), mockSession(), mockConfig());

  const logs = getLogs();
  expect(logs.some((l) => l.startsWith('Injected X-Trace-Id:'))).toBe(true);
});

test('trace ID changes per request', () => {
  const r1 = runHook('pre', mockRequest({ URL: '/a' }), mockSession(), mockConfig());
  const r2 = runHook('pre', mockRequest({ URL: '/b' }), mockSession(), mockConfig());

  expect(r1.Request.SetHeaders['X-Trace-Id']).not.toBe(r2.Request.SetHeaders['X-Trace-Id']);
});
