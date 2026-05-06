/// <reference types="@tyk-technologies/tyk-plugin-types" />

// Auth-check plugin: replaces built-in authentication with HMAC signature validation.
// Client sends X-Signature: hex(HMAC-SHA256(method + url + body, hmac_secret)).
// Match -> session is attached and the gateway proceeds.
// Miss/wrong -> 401.

import * as CryptoJS from 'crypto-js';

var handler = new TykJS.TykMiddleware.NewMiddleware({});

// Expose `handler` on the goja runtime's global scope (see starter AGENTS.md).
(globalThis as any).handler = handler;

function emptySession(): Partial<TykSession> {
  // For a 401 path the gateway never reads the session, so an empty object is fine.
  return {};
}

function buildAuthorizedSession(): Partial<TykSession> {
  // rate/per/quota_max all zero = no per-key limits applied at this layer.
  // Bind a policy via apply_policies if you want the gateway to enforce quotas.
  return {
    rate: 0,
    per: 0,
    quota_max: 0,
    allowance: 0,
    meta_data: { auth_method: 'hmac' },
  };
}

handler.NewProcessRequest(function (
  request: TykRequest,
  _session: TykSession,
  config: TykConfig
): TykHandlerResult {
  var secret = (config.config_data && (config.config_data as any)['hmac_secret']) || '';

  if (!secret) {
    log('[auth-check-hmac] config_data.hmac_secret is not set — rejecting request');
    request.ReturnOverrides.ResponseCode = 500;
    request.ReturnOverrides.ResponseError = 'hmac_secret not configured';
    request.ReturnOverrides.OverrideError = true;
    return handler.ReturnAuthData(request, emptySession());
  }

  // Headers is multi-value (string[]). Take the first entry if present.
  var sigHeader = request.Headers && request.Headers['X-Signature'];
  var provided = sigHeader && sigHeader.length > 0 ? sigHeader[0] : '';

  if (!provided) {
    log('[auth-check-hmac] missing X-Signature header — rejecting request');
    request.ReturnOverrides.ResponseCode = 401;
    request.ReturnOverrides.ResponseError = 'missing X-Signature';
    request.ReturnOverrides.OverrideError = true;
    return handler.ReturnAuthData(request, emptySession());
  }

  var signingInput = request.Method + request.URL + (request.Body || '');
  var expected = CryptoJS.HmacSHA256(signingInput, secret).toString(CryptoJS.enc.Hex);

  if (provided !== expected) {
    log('[auth-check-hmac] signature mismatch — rejecting request');
    request.ReturnOverrides.ResponseCode = 401;
    request.ReturnOverrides.ResponseError = 'invalid signature';
    request.ReturnOverrides.OverrideError = true;
    return handler.ReturnAuthData(request, emptySession());
  }

  // Match: hand the gateway a minimal session and let the request proceed.
  return handler.ReturnAuthData(request, buildAuthorizedSession());
});
