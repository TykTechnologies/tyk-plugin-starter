// Local mock runtime for vitest.
// Installs the goja-style globals (TykJS, log, TykMakeHttpRequest, ...) before
// the plugin module is imported. Vitest's setupFiles config wires this in.
//
// This will move to @tyk/plugin-test on npm in a future release; the public
// API (mockRequest, mockSession, mockHttp, runHook) will stay stable.

interface RegisteredHandlers {
  request?: (req: any, session: any, config: any) => any;
  response?: (res: any, session: any, config: any) => any;
}

const handlers: RegisteredHandlers = {};
const logs: string[] = [];

interface HttpStub {
  match: { method?: string; domain?: string; resource?: string };
  response: { Code: number; Body: string; Headers?: object };
}

const httpStubs: HttpStub[] = [];
const keyStore = new Map<string, string>();

// Backing store for the TykStorage* bindings (gateway-shared Redis storage).
// expiresAt is an absolute epoch-ms deadline, or null for "no expiry".
interface StorageEntry {
  value: string;
  expiresAt: number | null;
}
const storage = new Map<string, StorageEntry>();

class Middleware {
  constructor(_spec: object) {}
  NewProcessRequest(fn: (req: any, session: any, config: any) => any) {
    handlers.request = fn;
  }
  NewProcessResponse(fn: (res: any, session: any, config: any) => any) {
    handlers.response = fn;
  }
  ReturnData(request: any, sessionMeta: any) {
    return { Request: request, SessionMeta: sessionMeta };
  }
  ReturnAuthData(request: any, session: any) {
    return { Request: request, Session: session };
  }
  ReturnResponseData(response: any, sessionMeta: any) {
    return { Request: { Headers: {} }, Response: response, SessionMeta: sessionMeta };
  }
}

// Install globals BEFORE plugin module is imported.
const g = globalThis as any;

g.TykJS = {
  TykMiddleware: { NewMiddleware: Middleware },
};

g.log = (msg: string) => {
  logs.push(msg);
};
g.rawlog = (msg: string) => {
  logs.push(msg);
};

g.b64enc = (s: string) => Buffer.from(s, 'utf8').toString('base64');
g.b64dec = (s: string) => Buffer.from(s, 'base64').toString('utf8');
g.rawb64enc = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
g.rawb64dec = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

g.TykMakeHttpRequest = (jsonConfig: string) => {
  const cfg = JSON.parse(jsonConfig);
  for (const stub of httpStubs) {
    if (
      (!stub.match.method || stub.match.method === cfg.Method) &&
      (!stub.match.domain || stub.match.domain === cfg.Domain) &&
      (!stub.match.resource || stub.match.resource === cfg.Resource)
    ) {
      return JSON.stringify(stub.response);
    }
  }
  throw new Error(
    `[harness] No mock registered for ${cfg.Method} ${cfg.Domain}${cfg.Resource}. ` +
      `Use mockHttp.when({...}).respond({...}) in your test.`
  );
};

// TykBatchRequest is a real gateway global (batched outbound HTTP). Its on-the-wire
// request/response shape isn't mirrored here yet, so fail loudly rather than encode a
// possibly-wrong shape that would mislead tests — stub it in your test if you need it.
g.TykBatchRequest = (_jsonConfig: string) => {
  throw new Error(
    '[harness] TykBatchRequest is not mocked in this harness. Stub it in your test, ' +
      'or use TykMakeHttpRequest (mocked via mockHttp) where possible.'
  );
};

g.TykGetKeyData = (key: string, _apiId: string) => keyStore.get(key) ?? '';
g.TykSetKeyData = (key: string, sessionJson: string, _suppressReset: string) => {
  keyStore.set(key, sessionJson);
};

// TykStorage* bindings (gateway v5.15+, goja): shared Redis-backed storage.
// The mocks mirror the gateway contract exactly, including the input caps —
// the gateway throws on violations, so the mocks throw too, letting local
// tests catch them before deployment.

const STORAGE_MAX_KEY_BYTES = 256;
const STORAGE_MAX_VALUE_BYTES = 64 * 1024;

function storageValidateKey(fn: string, key: string): void {
  if (!key) {
    throw new Error(`[harness] ${fn}: key must not be empty`);
  }
  if (Buffer.byteLength(key, 'utf8') > STORAGE_MAX_KEY_BYTES) {
    throw new Error(`[harness] ${fn}: key exceeds ${STORAGE_MAX_KEY_BYTES} bytes`);
  }
}

function storageValidateValue(fn: string, value: string): void {
  if (Buffer.byteLength(value, 'utf8') > STORAGE_MAX_VALUE_BYTES) {
    throw new Error(`[harness] ${fn}: value exceeds ${STORAGE_MAX_VALUE_BYTES} bytes`);
  }
}

// Returns the live (non-expired) entry, lazily evicting expired ones —
// TTL is honored against Date.now() at read time, like Redis.
function storageLiveEntry(key: string): StorageEntry | undefined {
  const entry = storage.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    storage.delete(key);
    return undefined;
  }
  return entry;
}

g.TykStorageGet = (key: string): string | null => {
  storageValidateKey('TykStorageGet', key);
  const entry = storageLiveEntry(key);
  return entry ? entry.value : null;
};

g.TykStorageSet = (key: string, value: string, ttlSeconds: number): void => {
  storageValidateKey('TykStorageSet', key);
  storageValidateValue('TykStorageSet', value);
  storage.set(key, {
    value,
    expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
  });
};

g.TykStorageSetNX = (key: string, value: string, ttlSeconds: number): boolean => {
  storageValidateKey('TykStorageSetNX', key);
  storageValidateValue('TykStorageSetNX', value);
  if (storageLiveEntry(key)) {
    return false; // already claimed
  }
  storage.set(key, {
    value,
    expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
  });
  return true;
};

g.TykStorageDel = (key: string): void => {
  storageValidateKey('TykStorageDel', key);
  storage.delete(key);
};

// Redis TTL semantics: -2 = key missing, -1 = exists with no expiry,
// otherwise remaining seconds.
g.TykStorageTTL = (key: string): number => {
  storageValidateKey('TykStorageTTL', key);
  const entry = storageLiveEntry(key);
  if (!entry) return -2;
  if (entry.expiresAt === null) return -1;
  return Math.ceil((entry.expiresAt - Date.now()) / 1000);
};

// Atomic increment. Returns the NEW value as a string (Redis INCR semantics).
// The ttl is applied only on the increment that creates the key; subsequent
// increments leave the existing expiry untouched.
g.TykStorageIncr = (key: string, ttlSeconds: number): string => {
  storageValidateKey('TykStorageIncr', key);
  const entry = storageLiveEntry(key);
  if (!entry) {
    storage.set(key, {
      value: '1',
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
    return '1';
  }
  const current = parseInt(entry.value, 10);
  if (isNaN(current) || String(current) !== entry.value) {
    throw new Error('[harness] TykStorageIncr: value is not an integer');
  }
  entry.value = String(current + 1);
  return entry.value;
};

// Block APIs that don't exist in goja so they fail loudly during tests.
g.setTimeout = () => {
  throw new Error('[harness] setTimeout is not available in the goja runtime.');
};
g.setInterval = () => {
  throw new Error('[harness] setInterval is not available in the goja runtime.');
};

// Public test API ---------------------------------------------------

export function mockRequest(overrides: Partial<any> = {}): any {
  return {
    Headers: {},
    SetHeaders: {},
    DeleteHeaders: [],
    Body: '',
    URL: '/',
    Method: 'GET',
    Params: {},
    AddParams: {},
    ExtendedParams: {},
    DeleteParams: [],
    ReturnOverrides: {
      ResponseCode: 0,
      ResponseError: '',
      ResponseBody: '',
      ResponseHeaders: {},
      OverrideError: false,
    },
    IgnoreBody: false,
    Scheme: 'https',
    RequestURI: '/',
    ...overrides,
  };
}

export function mockResponse(overrides: Partial<any> = {}): any {
  return {
    StatusCode: 200,
    Body: '',
    Headers: {},
    SetHeaders: {},
    DeleteHeaders: [],
    ...overrides,
  };
}

export function mockSession(overrides: Partial<any> = {}): any {
  return {
    alias: '',
    org_id: '',
    meta_data: {},
    rate: 0,
    per: 0,
    expires: 0,
    quota_max: 0,
    quota_remaining: 0,
    quota_renewal_rate: 0,
    quota_renews: 0,
    access_rights: {},
    apply_policy_id: '',
    apply_policies: [],
    oauth_client_id: '',
    oauth_keys: {},
    certificate: '',
    basic_auth_data: { password: '', hash_type: '' },
    jwt_data: { secret: '' },
    hmac_enabled: false,
    hmac_string: '',
    is_inactive: false,
    monitor: { trigger_limits: [] },
    tags: [],
    enable_detail_recording: false,
    enable_detailed_recording: false,
    ...overrides,
  };
}

export function mockConfig(overrides: Partial<any> = {}): any {
  return {
    config_data: {},
    APIID: 'test-api',
    OrgID: 'test-org',
    ...overrides,
  };
}

export const mockHttp = {
  when(match: HttpStub['match']) {
    return {
      respond(response: HttpStub['response']) {
        httpStubs.push({ match, response });
      },
    };
  },
  reset() {
    httpStubs.length = 0;
  },
};

export const mockKeyStore = {
  set(key: string, sessionJson: string) {
    keyStore.set(key, sessionJson);
  },
  get(key: string): string | undefined {
    return keyStore.get(key);
  },
  reset() {
    keyStore.clear();
  },
};

// Seed/inspect the TykStorage* backing store from tests. Mirrors mockKeyStore's
// shape: preset values, read raw entries, reset. `set` takes an optional
// ttlSeconds (default: no expiry); `get` returns the live value or undefined
// (expired entries count as absent); `raw` exposes the underlying entry
// (value + expiresAt) for TTL assertions.
export const mockStorage = {
  set(key: string, value: string, ttlSeconds = 0) {
    storage.set(key, {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  },
  get(key: string): string | undefined {
    return storageLiveEntry(key)?.value;
  },
  raw(key: string): { value: string; expiresAt: number | null } | undefined {
    return storage.get(key);
  },
  reset() {
    storage.clear();
  },
};

export type Hook = 'pre' | 'post' | 'post_key_auth' | 'auth_check' | 'response';

export function runHook(hook: Hook, request: any, session: any, config: any): any {
  // Goja deployment fidelity check: webpack wraps the entry module in a factory
  // function, so a top-level `var handler` is invisible to the gateway (which
  // evaluates `handler.DoProcessRequest(...)` against the JSVM's global scope).
  // The plugin must explicitly assign to `globalThis.handler`. If it doesn't,
  // tests pass but the bundle fails in production. Catch it here.
  if (typeof (globalThis as any).handler === 'undefined') {
    throw new Error(
      '[harness] globalThis.handler is not set. After constructing the handler, add:\n' +
        "  (globalThis as any).handler = handler;\n" +
        'Without this, the bundle works in tests but fails in goja with "ReferenceError: handler is not defined".'
    );
  }
  if (hook === 'response') {
    if (!handlers.response) {
      throw new Error('[harness] No response handler registered. Did the plugin call handler.NewProcessResponse?');
    }
    return handlers.response(request, session, config);
  }
  if (!handlers.request) {
    throw new Error('[harness] No request handler registered. Did the plugin call handler.NewProcessRequest?');
  }
  return handlers.request(request, session, config);
}

export function getLogs(): string[] {
  return [...logs];
}

export function clearLogs(): void {
  logs.length = 0;
}

export function resetAll(): void {
  httpStubs.length = 0;
  keyStore.clear();
  storage.clear();
  logs.length = 0;
}
