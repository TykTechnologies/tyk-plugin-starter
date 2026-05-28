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

test('tenant_id present on session.meta_data → SetHeaders carries it and log notes "applied"', () => {
  const result = runHook(
    'post_key_auth',
    mockRequest(),
    mockSession({ meta_data: { tenant_id: 'tenant-123' } }),
    mockConfig()
  );

  expect(result.Request.SetHeaders['X-Tenant-Id']).toBe('tenant-123');
  expect(getLogs().some((l) => l.indexOf('applied') !== -1)).toBe(true);
});

test('string tenant_id "acme-co" propagates verbatim', () => {
  const result = runHook(
    'post_key_auth',
    mockRequest(),
    mockSession({ meta_data: { tenant_id: 'acme-co' } }),
    mockConfig()
  );

  expect(result.Request.SetHeaders['X-Tenant-Id']).toBe('acme-co');
});

test('numeric tenant_id is coerced to string', () => {
  // meta_data is typed `{[key: string]: any}` — values may be richer than strings.
  // SetHeaders only accepts strings, so the plugin must String()-coerce before assignment.
  const result = runHook(
    'post_key_auth',
    mockRequest(),
    mockSession({ meta_data: { tenant_id: 42 } }),
    mockConfig()
  );

  expect(result.Request.SetHeaders['X-Tenant-Id']).toBe('42');
});

test('missing tenant_id → no header, WARN logged, request passes through', () => {
  const req = mockRequest();
  const result = runHook('post_key_auth', req, mockSession({ meta_data: {} }), mockConfig());

  expect(result.Request.SetHeaders['X-Tenant-Id']).toBeUndefined();
  expect(result.Request.ReturnOverrides.ResponseCode).toBe(0);
  expect(getLogs().some((l) => l.indexOf('WARN') !== -1)).toBe(true);
});

test('empty-string tenant_id is treated as missing (WARN, no header)', () => {
  const result = runHook(
    'post_key_auth',
    mockRequest(),
    mockSession({ meta_data: { tenant_id: '' } }),
    mockConfig()
  );

  expect(result.Request.SetHeaders['X-Tenant-Id']).toBeUndefined();
  expect(getLogs().some((l) => l.indexOf('WARN') !== -1)).toBe(true);
});

test('sequential calls with different tenants do not leak across requests', () => {
  // Goja constructs a fresh request object per call, but a buggy plugin could close over
  // shared state. This test pins the contract: each request gets its own tenant.
  const r1 = runHook(
    'post_key_auth',
    mockRequest(),
    mockSession({ meta_data: { tenant_id: 'tenant-a' } }),
    mockConfig()
  );
  const r2 = runHook(
    'post_key_auth',
    mockRequest(),
    mockSession({ meta_data: { tenant_id: 'tenant-b' } }),
    mockConfig()
  );
  const r3 = runHook(
    'post_key_auth',
    mockRequest(),
    mockSession({ meta_data: {} }),
    mockConfig()
  );

  expect(r1.Request.SetHeaders['X-Tenant-Id']).toBe('tenant-a');
  expect(r2.Request.SetHeaders['X-Tenant-Id']).toBe('tenant-b');
  expect(r3.Request.SetHeaders['X-Tenant-Id']).toBeUndefined();
});
