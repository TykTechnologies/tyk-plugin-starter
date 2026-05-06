/// <reference types="@tyk-technologies/tyk-plugin-types" />

// JWS request signer.
// Signs request.Body with HMAC-SHA256 and sets X-Signature: header.payload.signature.
// Reads the shared secret from config_data.jws_secret on the API definition.

import * as CryptoJS from 'crypto-js';

var handler = new TykJS.TykMiddleware.NewMiddleware({});

// Expose `handler` on the goja runtime's global scope (see starter AGENTS.md).
(globalThis as any).handler = handler;

function base64ToBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

handler.NewProcessRequest(function (
  request: TykRequest,
  session: TykSession,
  config: TykConfig
): TykHandlerResult {
  var secret = (config.config_data && (config.config_data as any)['jws_secret']) || '';

  if (!secret) {
    log('[jws] config_data.jws_secret is not set — rejecting request');
    request.ReturnOverrides.ResponseCode = 500;
    request.ReturnOverrides.ResponseError = 'jws_secret not configured';
    request.ReturnOverrides.OverrideError = true;
    return handler.ReturnData(request, {});
  }

  var encodedHeader = rawb64enc('{"alg":"HS256","typ":"JWS"}');
  var encodedPayload = rawb64enc(request.Body || '');
  var signingInput = encodedHeader + '.' + encodedPayload;

  var sigB64 = CryptoJS.HmacSHA256(signingInput, secret).toString(CryptoJS.enc.Base64);
  var signature = base64ToBase64Url(sigB64);

  request.SetHeaders['X-Signature'] = signingInput + '.' + signature;

  return handler.ReturnData(request, {});
});
