/// <reference path="../../../src/types.d.ts" />

// Response PII redactor.
// Scrubs US Social Security Number-shaped strings (NNN-NN-NNNN) from response.Body
// before the gateway returns it to the client. Headers and status code are untouched.

var handler = new TykJS.TykMiddleware.NewMiddleware({});

// Expose `handler` on the goja runtime's global scope (see starter AGENTS.md).
(globalThis as any).handler = handler;

var SSN_PATTERN = /\d{3}-\d{2}-\d{4}/g;
var SSN_MASK = '***-**-****';

handler.NewProcessResponse(function (
  response: TykResponse,
  session: TykSession,
  config: TykConfig
): TykHandlerResult {
  var body = response.Body;

  if (!body) {
    return handler.ReturnResponseData(response, {});
  }

  response.Body = body.replace(SSN_PATTERN, SSN_MASK);

  return handler.ReturnResponseData(response, {});
});
