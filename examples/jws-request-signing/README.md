# JWS Request Signing

Sign every outbound request with HMAC-SHA256 in JWS compact form. The signature lands in `X-Signature` so an upstream service can verify the request body is authentic and unmodified.

## When to use

- Webhooks that need cryptographic proof of origin
- Service-to-service calls where the upstream wants signature verification
- Any time you'd reach for `jose` or `jsonwebtoken` to sign — this runs cleanly in goja

## What it does

On every request:

1. Reads `jws_secret` from `config_data` on the API definition
2. Builds a JWS compact form: `header.payload.signature`
   - **Header** — `{"alg":"HS256","typ":"JWS"}` (base64url)
   - **Payload** — the request body (base64url)
   - **Signature** — HMAC-SHA256 over `header.payload` (base64url)
3. Sets `X-Signature: header.payload.signature`

## Configure

In the API definition's `config_data`:

```json
{
  "jws_secret": "your-shared-secret"
}
```

If `jws_secret` is missing the plugin rejects the request with HTTP 500.

## Try it

```bash
npm install
npm test
npm run build:bundle    # dist/bundle.zip
```

## Notes

- Uses `crypto-js` for HMAC — pure JS, runs in goja. Node's `crypto` and `jose` (Web Crypto) won't work.
- `request.Body` is read as a string. Base64-encode binary bodies before this hook.
- This is the **compact** form. For RFC 7797 detached JWS, drop the payload between the dots.
