# Examples

Marquee plugin patterns demonstrating common Tyk plugin shapes. Copy a folder, modify, test, deploy.

## Available

- **[jws-request-signing](./jws-request-signing/)** — sign outbound requests with HMAC-SHA256 in JWS compact form (uses `crypto-js`).

## Coming soon

The remaining marquee patterns will land here:

- **soap-to-rest** — SOAP-to-REST conversion using `fast-xml-parser`
- **brute-force-lockout** — track failed auth attempts in shared state, lock out attackers (uses `TykStore` when available)
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

Examples reference the starter's harness and types via relative paths (`../../test/_harness.ts`, `../../src/types.d.ts`). When `@tyk/plugin-types` and `@tyk/plugin-test` ship on npm, the imports will swap to the package names.
