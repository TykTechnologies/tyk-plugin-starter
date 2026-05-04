/// <reference path="./types.d.ts" />

// Starter Tyk plugin — pre-request hook.
// Injects an X-Trace-Id header on every request.
// Replace the body of NewProcessRequest with your logic.

var handler = new TykJS.TykMiddleware.NewMiddleware({});

handler.NewProcessRequest(function (request: TykRequest, session: TykSession, config: TykConfig): TykHandlerResult {
  var traceId = generateTraceId();
  request.SetHeaders['X-Trace-Id'] = traceId;
  log('Injected X-Trace-Id: ' + traceId);
  return handler.ReturnData(request, {});
});

// Expose `handler` on the goja runtime's global scope. Webpack wraps the entry
// module in a factory function, so a top-level `var handler` would otherwise be
// invisible to the gateway (which evaluates `handler.DoProcessRequest(...)`).
// The harness asserts this is set so tests catch missing assignments.
(globalThis as any).handler = handler;

function generateTraceId(): string {
  var ts = new Date().getTime().toString(16);
  var rand = Math.floor(Math.random() * 0xffffffff).toString(16);
  return ts + '-' + rand;
}
