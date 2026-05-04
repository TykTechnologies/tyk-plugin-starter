/// <reference path="../../../src/types.d.ts" />

// Correlation ID injector (post hook).
// Runs after auth, before upstream. Preserves an inbound X-Correlation-Id if
// present and non-empty; otherwise generates a UUID v4. Either way, the
// resolved value is written to request.SetHeaders so upstream sees it.

// IMPORTANT: install crypto.getRandomValues shim BEFORE importing uuid. The
// browser build of uuid resolves it lazily on first call; this just makes
// sure goja has a getRandomValues to find.
import './crypto-shim';
import { v4 as uuidv4 } from 'uuid';

var handler = new TykJS.TykMiddleware.NewMiddleware({});

// Expose `handler` on the goja runtime's global scope (see starter AGENTS.md).
(globalThis as any).handler = handler;

handler.NewProcessRequest(function (
  request: TykRequest,
  session: TykSession,
  config: TykConfig
): TykHandlerResult {
  var inbound = request.Headers && request.Headers['X-Correlation-Id'];
  var existing = '';
  if (inbound && inbound.length > 0) {
    existing = inbound[0] || '';
  }

  var id = '';
  var source = '';
  if (existing) {
    id = existing;
    source = 'inbound';
  } else {
    id = uuidv4();
    source = 'generated';
  }

  request.SetHeaders['X-Correlation-Id'] = id;
  log('[correlation-id] using ' + id + ' (source: ' + source + ')');

  return handler.ReturnData(request, {});
});
