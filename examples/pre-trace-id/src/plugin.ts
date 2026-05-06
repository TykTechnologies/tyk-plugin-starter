/// <reference types="@tyk-technologies/tyk-plugin-types" />

// Minimal pre-hook plugin: stamps X-Trace-Id on every request before the
// gateway forwards to upstream. Useful as a baseline tracing header, and
// paired with jws-request-signing in the multi-bundle e2e to demonstrate
// that two pre-hook bundles compose onto a single API.

var handler = new TykJS.TykMiddleware.NewMiddleware({});

handler.NewProcessRequest(function (request: TykRequest, _session: TykSession, _config: TykConfig): TykHandlerResult {
  var traceId = Date.now().toString(16) + '-' + Math.floor(Math.random() * 0xffffffff).toString(16);
  request.SetHeaders['X-Trace-Id'] = traceId;
  log('[pre-trace-id] injected ' + traceId);
  return handler.ReturnData(request, {});
});

(globalThis as any).handler = handler;
