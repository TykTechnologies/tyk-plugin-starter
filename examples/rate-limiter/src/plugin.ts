/// <reference types="@tyk-technologies/tyk-plugin-types" />

// rate-limiter: a fixed-window request rate limit backed by the gateway's
// shared storage. Each caller (identified by an X-Client-Id header, or
// "anonymous") gets LIMIT requests per WINDOW_SECONDS; the request that tips a
// caller over the limit is rejected with 429.
//
// The core is one atomic call: TykStorageIncr bumps a per-(caller, window)
// counter in the gateway's Redis and returns the new value, so concurrent
// requests can't miscount the way a Get-then-Set would. Bucketing the key by
// window number means each window starts from zero — no separate reset step,
// and the TTL just garbage-collects the expired window keys.

// The TykStorage* bindings ship in the gateway but this example pins
// @tyk-technologies/tyk-plugin-types ^0.1.0, so declare the one we use.
// (The full surface: TykStorageGet/Set/SetNX/Del/TTL/Incr.)
declare function TykStorageIncr(key: string, ttlSeconds: number): string;

var handler = new TykJS.TykMiddleware.NewMiddleware({});

// Webpack wraps the entry in a factory, so the gateway only sees globals.
(globalThis as any).handler = handler;

var LIMIT = 5; // requests allowed per window, per caller
var WINDOW_SECONDS = 60; // window length

handler.NewProcessRequest(function (
  request: TykRequest,
  _session: TykSession,
  _config: TykConfig
): TykHandlerResult {
  // Identify the caller. Inbound headers are multi-value arrays.
  var idVals = request.Headers['X-Client-Id'];
  var caller = (idVals && idVals[0]) || 'anonymous';

  // Bucket by fixed window so each window counts independently.
  var windowNo = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  var key = 'ratelimit:' + caller + ':' + windowNo;

  var count: number;
  try {
    // Atomic increment; the TTL keeps a window key from outliving its window.
    count = parseInt(TykStorageIncr(key, WINDOW_SECONDS), 10);
  } catch (e) {
    // Storage is unavailable. Fail OPEN: a limiter outage shouldn't take the
    // API down with it. (Contrast idempotency-guard, which fails closed — an
    // idempotency check is a correctness control, a rate limit is an
    // availability control, so their safe defaults differ.)
    log('[rate-limiter] storage error, allowing request: ' + e);
    return handler.ReturnData(request, {});
  }

  // Surface the budget to the upstream/caller.
  var remaining = Math.max(0, LIMIT - count);
  request.SetHeaders['X-RateLimit-Limit'] = String(LIMIT);
  request.SetHeaders['X-RateLimit-Remaining'] = String(remaining);

  if (count > LIMIT) {
    log('[rate-limiter] over limit for ' + caller + ' (' + count + '/' + LIMIT + ')');
    request.ReturnOverrides.ResponseCode = 429;
    request.ReturnOverrides.ResponseError = 'rate limit exceeded';
    request.ReturnOverrides.ResponseHeaders = {
      'Retry-After': String(WINDOW_SECONDS),
      'X-RateLimit-Limit': String(LIMIT),
      'X-RateLimit-Remaining': '0',
    };
    request.ReturnOverrides.OverrideError = true;
    return handler.ReturnData(request, {});
  }

  return handler.ReturnData(request, {});
});
