import { test, expect, beforeEach, afterEach } from 'vitest';
import {
  runHook,
  mockRequest,
  mockSession,
  mockConfig,
  resetAll,
} from '../../../test/_harness';
import '../src/plugin';

const g = globalThis as any;
const realIncr = g.TykStorageIncr;
const realDateNow = Date.now;

// Control time directly rather than vi.useFakeTimers() — the harness makes
// setTimeout throw (goja has no timers), which fake timers would trip over.
// The plugin only reads Date.now(), so overriding that is enough to pin the
// window every request lands in.
let now = Date.parse('2026-01-01T00:00:00Z');

beforeEach(() => {
  resetAll();
  now = Date.parse('2026-01-01T00:00:00Z');
  Date.now = () => now;
});

afterEach(() => {
  Date.now = realDateNow;
  g.TykStorageIncr = realIncr;
});

function hit(clientId?: string) {
  const Headers = clientId ? { 'X-Client-Id': [clientId] } : {};
  return runHook('pre', mockRequest({ Headers }), mockSession(), mockConfig());
}

test('first 5 requests pass with a decrementing budget; the 6th is 429', () => {
  for (let i = 1; i <= 5; i++) {
    const r = hit('acme');
    expect(r.Request.ReturnOverrides.ResponseCode).toBe(0);
    expect(r.Request.SetHeaders['X-RateLimit-Remaining']).toBe(String(5 - i));
  }

  const sixth = hit('acme');
  expect(sixth.Request.ReturnOverrides.ResponseCode).toBe(429);
  expect(sixth.Request.ReturnOverrides.OverrideError).toBe(true);
  expect(sixth.Request.ReturnOverrides.ResponseHeaders['Retry-After']).toBe('60');
});

test('each caller has an independent bucket', () => {
  for (let i = 0; i < 5; i++) hit('acme');
  // acme is now at its limit; a different caller is unaffected.
  expect(hit('acme').Request.ReturnOverrides.ResponseCode).toBe(429);
  expect(hit('globex').Request.ReturnOverrides.ResponseCode).toBe(0);
});

test('the window resets: after WINDOW_SECONDS the caller is allowed again', () => {
  for (let i = 0; i < 6; i++) hit('acme'); // trip the limit
  expect(hit('acme').Request.ReturnOverrides.ResponseCode).toBe(429);

  now += 61_000; // +61s → next window
  expect(hit('acme').Request.ReturnOverrides.ResponseCode).toBe(0);
});

test('no X-Client-Id shares the "anonymous" bucket', () => {
  for (let i = 0; i < 5; i++) hit(); // anonymous
  expect(hit().Request.ReturnOverrides.ResponseCode).toBe(429);
});

test('storage failure fails OPEN (request passes through)', () => {
  g.TykStorageIncr = () => {
    throw new Error('redis unavailable');
  };

  const r = hit('acme');
  expect(r.Request.ReturnOverrides.ResponseCode).toBe(0);
});
