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

g.TykGetKeyData = (key: string, _apiId: string) => keyStore.get(key) ?? '';
g.TykSetKeyData = (key: string, sessionJson: string, _suppressReset: string) => {
  keyStore.set(key, sessionJson);
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
  logs.length = 0;
}
