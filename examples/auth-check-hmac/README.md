# Auth Check — HMAC Signature

Replace built-in authentication with HMAC-SHA256 signature validation. The client signs `method + url + body` with a shared secret and sends the hex digest in `X-Signature`. The plugin recomputes the signature; if it matches, the request proceeds with a minimal session attached.

## When to use

- Service-to-service APIs where the caller already shares a secret with you
- Webhook receivers that want cryptographic proof a request was not tampered with
- Any place you'd otherwise extract an API key, but you want the body covered too

## What it does

On every request, before any other authentication runs:

1. Reads `hmac_secret` from `config_data` on the API definition
2. Reads `X-Signature` from the request headers (multi-value; takes the first value)
3. Computes `HMAC-SHA256(request.Method + request.URL + request.Body, hmac_secret)` as hex
4. Compares against the client-supplied signature
5. On match — returns a minimal session via `ReturnAuthData` and the gateway proceeds
6. On mismatch or missing header — returns 401 via `ReturnOverrides`

## Configure

In the API definition's `config_data`:

```json
{
  "hmac_secret": "your-shared-secret"
}
```

If `hmac_secret` is missing the plugin rejects every request with HTTP 500.

## Client example

```bash
SECRET="your-shared-secret"
METHOD="POST"
URL="/orders"
BODY='{"item":"widget"}'
SIG=$(printf "%s%s%s" "$METHOD" "$URL" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
curl -X "$METHOD" "https://gateway.example.com$URL" \
  -H "X-Signature: $SIG" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

## Try it

```bash
npm install
npm test
npm run build:bundle    # dist/bundle.zip
```

## Notes

- Uses `crypto-js` for HMAC — pure JS, runs in goja. Node's `crypto` won't work here.
- The hook is `auth_check`, which **replaces** built-in auth. The gateway will not try to extract an API key, JWT, etc. on top of this.
- The session returned is intentionally minimal (`rate: 0, per: 0, quota_max: 0` means unlimited at this layer; bind a policy if you want quotas).
- To attach per-key context (e.g. an account ID extracted from `X-Account` or a key-id-prefixed signature), set fields on `session.meta_data` before returning.
