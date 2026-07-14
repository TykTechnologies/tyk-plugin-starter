/// <reference types="@tyk-technologies/tyk-plugin-types" />

// idempotency-guard: reject duplicate requests that carry the same
// Idempotency-Key header, using the gateway's shared storage bindings.
//
// The whole trick is one call: TykStorageSetNX is an atomic
// "set if not exists" against the gateway's Redis. The FIRST request with a
// given key claims it and proceeds; any concurrent or repeated request with
// the same key loses the claim and gets a 409 — no read-then-write race.

// The TykStorage* bindings ship in the gateway but aren't in
// @tyk-technologies/tyk-plugin-types yet, so declare the one we use here.
// (The full surface: TykStorageGet/Set/SetNX/Del/TTL/Incr.)
declare function TykStorageSetNX(key: string, value: string, ttlSeconds: number): boolean;

var handler = new TykJS.TykMiddleware.NewMiddleware({});

// Webpack wraps the entry in a factory, so the gateway only sees globals.
(globalThis as any).handler = handler;

// How long a claim blocks duplicates, in seconds. After this the same key is
// accepted again — tune to your clients' retry window.
var CLAIM_TTL_SECONDS = 60;

handler.NewProcessRequest(function (
  request: TykRequest,
  _session: TykSession,
  _config: TykConfig
): TykHandlerResult {
  // Inbound headers are multi-value arrays; take the first value.
  var vals = request.Headers['Idempotency-Key'];
  var key = vals && vals[0];

  // No header — the client didn't opt in to idempotency. Pass through.
  if (!key) {
    return handler.ReturnData(request, {});
  }

  try {
    // Atomic claim: true means we're the first request with this key.
    var claimed = TykStorageSetNX('idem:' + key, 'pending', CLAIM_TTL_SECONDS);

    if (!claimed) {
      // Someone already holds the claim — this is a duplicate. Reject it.
      log('[idempotency-guard] duplicate rejected for key ' + key);
      request.ReturnOverrides.ResponseCode = 409;
      request.ReturnOverrides.ResponseError = 'duplicate request: Idempotency-Key already used';
      request.ReturnOverrides.OverrideError = true;
      return handler.ReturnData(request, {});
    }
  } catch (e) {
    // Storage is down or the key/value violated the binding limits. Fail
    // CLOSED: without the guard we can't rule out a duplicate side effect,
    // so refusing is safer than letting it through.
    log('[idempotency-guard] storage error, failing closed: ' + e);
    request.ReturnOverrides.ResponseCode = 500;
    request.ReturnOverrides.ResponseError = 'idempotency check unavailable';
    request.ReturnOverrides.OverrideError = true;
    return handler.ReturnData(request, {});
  }

  // Claim acquired — first request with this key. Let it through.
  log('[idempotency-guard] claimed key ' + key);
  return handler.ReturnData(request, {});
});
