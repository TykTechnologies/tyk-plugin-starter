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

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(() => {
  resetAll();
});

test('preserves inbound X-Correlation-Id when present', () => {
  const incoming = 'abc-123-from-client';
  const req = mockRequest({ Headers: { 'X-Correlation-Id': [incoming] } });

  const result = runHook('post', req, mockSession(), mockConfig());

  expect(result.Request.SetHeaders['X-Correlation-Id']).toBe(incoming);
});

test('generates a UUID v4 when X-Correlation-Id is missing', () => {
  const req = mockRequest();

  const result = runHook('post', req, mockSession(), mockConfig());

  const id = result.Request.SetHeaders['X-Correlation-Id'];
  expect(id).toMatch(UUID_V4_RE);
});

test('treats empty inbound X-Correlation-Id as missing and generates a UUID', () => {
  const req = mockRequest({ Headers: { 'X-Correlation-Id': [''] } });

  const result = runHook('post', req, mockSession(), mockConfig());

  const id = result.Request.SetHeaders['X-Correlation-Id'];
  expect(id).toMatch(UUID_V4_RE);
});

test('each generated UUID is unique across calls', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const result = runHook('post', mockRequest(), mockSession(), mockConfig());
    ids.add(result.Request.SetHeaders['X-Correlation-Id']);
  }
  expect(ids.size).toBe(25);
});

test('logs the resolved id and source', () => {
  const incoming = 'trace-xyz-789';
  runHook(
    'post',
    mockRequest({ Headers: { 'X-Correlation-Id': [incoming] } }),
    mockSession(),
    mockConfig()
  );

  const logs = getLogs();
  expect(logs.some((l) => l.indexOf(incoming) !== -1)).toBe(true);
  expect(logs.some((l) => l.indexOf('inbound') !== -1)).toBe(true);
});

test('logs the generated id and marks source as generated', () => {
  const result = runHook('post', mockRequest(), mockSession(), mockConfig());
  const id = result.Request.SetHeaders['X-Correlation-Id'];

  const logs = getLogs();
  expect(logs.some((l) => l.indexOf(id) !== -1)).toBe(true);
  expect(logs.some((l) => l.indexOf('generated') !== -1)).toBe(true);
});
