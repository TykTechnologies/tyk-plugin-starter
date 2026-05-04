/// <reference path="../../../src/types.d.ts" />

// Tenant-context enricher.
// Runs in the post_key_auth phase: after the gateway's built-in key authentication has
// validated the inbound credential and populated `session`, but before upstream is called.
// Reads `session.meta_data.tenant_id` and forwards it as `X-Tenant-Id` to upstream so
// downstream services don't have to re-derive tenancy from the API key.
//
// Auth failures are NOT this hook's job — the auth phase already rejected bad keys, so a
// missing tenant_id is logged at warning and the request passes through unchanged.

var handler = new TykJS.TykMiddleware.NewMiddleware({});

// Expose `handler` on the goja runtime's global scope (see starter AGENTS.md).
(globalThis as any).handler = handler;

handler.NewProcessRequest(function (
  request: TykRequest,
  session: TykSession,
  _config: TykConfig
): TykHandlerResult {
  var meta = session && session.meta_data ? session.meta_data : {};
  var raw = meta['tenant_id'];

  // Treat null/undefined/empty-string as missing. Coerce other values (e.g. numbers) to string
  // since SetHeaders is { [k: string]: string }.
  var tenantId = '';
  if (raw !== null && raw !== undefined) {
    tenantId = String(raw);
  }

  if (tenantId === '') {
    log('[tenant-context] WARN: session.meta_data.tenant_id missing; passing through unchanged');
    return handler.ReturnData(request, {});
  }

  request.SetHeaders['X-Tenant-Id'] = tenantId;
  log('[tenant-context] tenant=' + tenantId + ' applied');

  return handler.ReturnData(request, {});
});
