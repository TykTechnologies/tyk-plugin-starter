import { test, expect, beforeEach } from 'vitest';
import { runHook, mockResponse, mockSession, mockConfig, resetAll } from '../../../test/_harness';
import '../src/plugin';

beforeEach(() => {
  resetAll();
});

test('pass-through: body without SSNs is unchanged', () => {
  const original = 'Nothing sensitive here. Phone: 555-12-3, IDs: 12-345.';
  const res = mockResponse({ Body: original });

  const result = runHook('response', res, mockSession(), mockConfig());

  expect(result.Response.Body).toBe(original);
});

test('single SSN: one match gets redacted', () => {
  const res = mockResponse({ Body: 'User SSN: 123-45-6789. Have a nice day.' });

  const result = runHook('response', res, mockSession(), mockConfig());

  expect(result.Response.Body).toBe('User SSN: ***-**-****. Have a nice day.');
});

test('multiple SSNs: every match gets redacted', () => {
  const res = mockResponse({
    Body: 'A: 111-22-3333, B: 444-55-6666, C: 777-88-9999.',
  });

  const result = runHook('response', res, mockSession(), mockConfig());

  expect(result.Response.Body).toBe('A: ***-**-****, B: ***-**-****, C: ***-**-****.');
});

test('embedded in JSON: an SSN inside a JSON string value gets redacted', () => {
  const payload = JSON.stringify({
    name: 'Jane Doe',
    ssn: '987-65-4321',
    notes: 'secondary record 111-22-3333',
  });
  const res = mockResponse({ Body: payload });

  const result = runHook('response', res, mockSession(), mockConfig());

  const parsed = JSON.parse(result.Response.Body);
  expect(parsed.name).toBe('Jane Doe');
  expect(parsed.ssn).toBe('***-**-****');
  expect(parsed.notes).toBe('secondary record ***-**-****');
});

test('empty body: no-op, no errors', () => {
  const res = mockResponse({ Body: '' });

  const result = runHook('response', res, mockSession(), mockConfig());

  expect(result.Response.Body).toBe('');
});

test('status code and headers untouched', () => {
  const res = mockResponse({
    StatusCode: 418,
    Body: 'Customer 123-45-6789 record.',
    Headers: { 'X-Source': ['upstream-a'], 'Content-Type': ['text/plain'] },
    SetHeaders: { 'X-Edge': 'mark' },
    DeleteHeaders: ['X-Strip-Me'],
  });

  const result = runHook('response', res, mockSession(), mockConfig());

  expect(result.Response.Body).toBe('Customer ***-**-**** record.');
  expect(result.Response.StatusCode).toBe(418);
  expect(result.Response.Headers).toEqual({
    'X-Source': ['upstream-a'],
    'Content-Type': ['text/plain'],
  });
  expect(result.Response.SetHeaders).toEqual({ 'X-Edge': 'mark' });
  expect(result.Response.DeleteHeaders).toEqual(['X-Strip-Me']);
});
