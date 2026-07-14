// Contract tests for the TykStorage* harness mocks. These pin the mock
// behavior to the gateway contract so local tests stay faithful to what
// runs in production.

import { test, expect, beforeEach, afterEach } from 'vitest';
import { mockStorage, resetAll } from './_harness';

const g = globalThis as any;

// vitest's fake timers probe global setTimeout, which the harness deliberately
// makes throw (it doesn't exist in goja). The TTL logic only reads Date.now,
// so stub that directly instead.
const realNow = Date.now;

function advanceTimeMs(ms: number) {
  const frozen = realNow() + ms;
  Date.now = () => frozen;
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  Date.now = realNow;
});

// --- Get / Set / Del ---

test('Get returns null for a missing key', () => {
  expect(g.TykStorageGet('nope')).toBeNull();
});

test('Set then Get round-trips; ttl 0 means no expiry', () => {
  g.TykStorageSet('k', 'v', 0);
  expect(g.TykStorageGet('k')).toBe('v');
  expect(g.TykStorageTTL('k')).toBe(-1);
});

test('Set with ttl expires the key (honored at read time)', () => {
  g.TykStorageSet('k', 'v', 10);
  expect(g.TykStorageGet('k')).toBe('v');
  advanceTimeMs(11_000);
  expect(g.TykStorageGet('k')).toBeNull();
});

test('Del removes the key', () => {
  g.TykStorageSet('k', 'v', 0);
  g.TykStorageDel('k');
  expect(g.TykStorageGet('k')).toBeNull();
});

// --- SetNX ---

test('SetNX claims a free key (true), refuses a held key (false)', () => {
  expect(g.TykStorageSetNX('lock', 'a', 0)).toBe(true);
  expect(g.TykStorageSetNX('lock', 'b', 0)).toBe(false);
  expect(g.TykStorageGet('lock')).toBe('a'); // loser did not overwrite
});

test('SetNX succeeds again once the previous claim expired', () => {
  expect(g.TykStorageSetNX('lock', 'a', 5)).toBe(true);
  advanceTimeMs(6_000);
  expect(g.TykStorageSetNX('lock', 'b', 5)).toBe(true);
});

// --- TTL (Redis semantics) ---

test('TTL: -2 missing, -1 no expiry, remaining seconds otherwise', () => {
  expect(g.TykStorageTTL('missing')).toBe(-2);
  g.TykStorageSet('forever', 'v', 0);
  expect(g.TykStorageTTL('forever')).toBe(-1);
  g.TykStorageSet('timed', 'v', 60);
  const ttl = g.TykStorageTTL('timed');
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(60);
});

// --- Incr ---

test('Incr returns the new value as a string', () => {
  expect(g.TykStorageIncr('n', 0)).toBe('1');
  expect(g.TykStorageIncr('n', 0)).toBe('2');
  expect(typeof g.TykStorageIncr('n', 0)).toBe('string');
});

test('Incr applies ttl only on the increment that creates the key', () => {
  g.TykStorageIncr('n', 10); // creates with 10s ttl
  advanceTimeMs(5_000);
  g.TykStorageIncr('n', 9999); // ttl arg ignored — key exists
  expect(g.TykStorageTTL('n')).toBeLessThanOrEqual(5);
  advanceTimeMs(11_000); // past the original 10s deadline
  expect(g.TykStorageIncr('n', 10)).toBe('1'); // expired → recreated
});

test('Incr throws on a non-integer value', () => {
  g.TykStorageSet('s', 'not-a-number', 0);
  expect(() => g.TykStorageIncr('s', 0)).toThrow(/not an integer/);
});

// --- Input caps (all bindings throw, like the gateway) ---

test('empty key throws', () => {
  expect(() => g.TykStorageGet('')).toThrow(/empty/);
  expect(() => g.TykStorageSet('', 'v', 0)).toThrow(/empty/);
});

test('key over 256 bytes throws', () => {
  const bigKey = 'k'.repeat(257);
  expect(() => g.TykStorageSet(bigKey, 'v', 0)).toThrow(/256/);
  expect(() => g.TykStorageSetNX(bigKey, 'v', 0)).toThrow(/256/);
  expect(() => g.TykStorageDel(bigKey)).toThrow(/256/);
  expect(() => g.TykStorageTTL(bigKey)).toThrow(/256/);
  expect(() => g.TykStorageIncr(bigKey, 0)).toThrow(/256/);
});

test('value over 64KB throws', () => {
  const bigValue = 'v'.repeat(64 * 1024 + 1);
  expect(() => g.TykStorageSet('k', bigValue, 0)).toThrow(/65536/);
  expect(() => g.TykStorageSetNX('k', bigValue, 0)).toThrow(/65536/);
});

// --- mockStorage helper ---

test('mockStorage seeds and inspects the same store the bindings use', () => {
  mockStorage.set('seeded', 'value');
  expect(g.TykStorageGet('seeded')).toBe('value');

  g.TykStorageSet('written', 'x', 30);
  expect(mockStorage.get('written')).toBe('x');
  expect(mockStorage.raw('written')?.expiresAt).not.toBeNull();

  mockStorage.reset();
  expect(g.TykStorageGet('seeded')).toBeNull();
});
