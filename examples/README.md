# Examples

Marquee plugin patterns demonstrating common Tyk plugin shapes. Copy a folder, modify, test, deploy.

## Available

| Example | Hook | What it shows |
|---|---|---|
| [pre-trace-id](./pre-trace-id/) | `pre` | Minimal `pre` plugin — stamps `X-Trace-Id` on every request. The simplest possible plugin shape. |
| [jws-request-signing](./jws-request-signing/) | `pre` | Sign outbound requests with HMAC-SHA256 in JWS compact form (uses `crypto-js`). |
| [auth-check-hmac](./auth-check-hmac/) | `auth_check` | Replace built-in auth — validate `X-Signature: hex(HMAC-SHA256(method+url+body, secret))`, accept on match. |
| [post-key-auth-tenant-context](./post-key-auth-tenant-context/) | `post_key_auth` | Read `session.meta_data.tenant_id`, inject `X-Tenant-Id` header for upstream. |
| [post-correlation-id](./post-correlation-id/) | `post` | Preserve inbound `X-Correlation-Id` or generate UUID v4; uses the `uuid` npm package. |
| [response-pii-redaction](./response-pii-redaction/) | `response` | Mask SSN-shaped patterns in response bodies before they reach the client. |

Each example is unit-tested locally **and** runs against a real Tyk OSS gateway in CI via `e2e/` — see [e2e/README.md](../e2e/README.md).

## Composing multiple plugins on one API

The gateway accepts a list of bundles per API via `custom_middleware_bundles` — every bundle in the list runs in order on the matching hook. The starter ships an end-to-end demo that pairs `pre-trace-id` with `jws-request-signing` on a single API:

```jsonc
// e2e/apps/multi-bundle.json
{
  "custom_middleware_bundles": [
    "pre-trace-id.zip",
    "jws-request-signing.zip"
  ]
}
```

Both bundles export a global named `handler`; the gateway aliases each export under a per-(file, name) IIFE so they coexist without colliding. See [e2e/tests/multi-bundle.sh](../e2e/tests/multi-bundle.sh) for the assertion that both `X-Trace-Id` and `X-Signature` arrive at the upstream.

## Coming later

- **soap-to-rest** — SOAP-to-REST conversion using `fast-xml-parser`
- **brute-force-lockout** — track failed auth attempts in shared state (uses `TykStore` when available)
- **multi-tenant-rate-limit** — custom rate limit keyed by tenant claim
- **aws-lambda-invoker** — invoke Lambda via signed HTTP using `aws4`
- **jwe-body-encryption** — encrypt request body with `jose`
- **custom-datadog-metrics** — emit metrics to Datadog HTTP API
- **status-code-transform** — transform 401 to 302 redirect for SSO flows
- **jwt-claim-repackager** — decode JWT, mutate claims, re-sign

> Multi-realm JWT validation is now a built-in gateway feature, so it's no longer in the example list.

See the goja work entry's [plugin examples coverage](../../work/2026-03-26--goja-engine-poc-expansion/artifacts/plugin-examples-coverage.md) doc for the full picture of which patterns are achievable in goja today, with bundles, or with planned bindings.

## Pattern

Each example is a self-contained npm project. Inside any example folder:

```bash
npm install
npm test           # runs in pure Node — no gateway needed
npm run build      # produces dist/plugin.js
npm run build:bundle  # produces dist/bundle.zip for the bundle deploy path
```

Examples consume types from [`@tyk-technologies/tyk-plugin-types`](https://www.npmjs.com/package/@tyk-technologies/tyk-plugin-types) on npm. The test harness still lives in the starter at `../../test/_harness.ts` — it'll move to a separate `@tyk/plugin-test` npm package in a future release.
