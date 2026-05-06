# pre-trace-id

Minimal `pre` hook example. Injects an `X-Trace-Id` header on every request before the gateway forwards to upstream.

## What this shows

- The simplest possible plugin shape — useful as a starting template.
- The `(globalThis as any).handler = handler;` pattern that webpack-bundled plugins need so the gateway can find `handler` on the goja runtime's global scope.

## Composition demo

This plugin is also the second bundle in the multi-bundle e2e at `e2e/tests/multi-bundle.sh`, paired with `jws-request-signing`. Two pre-hook bundles compose onto a single API via `custom_middleware_bundles` in the API definition — both `handler` globals coexist because the gateway wraps each in a per-(file, name) IIFE that aliases the export.

```jsonc
// e2e/apps/multi-bundle.json
{
  "custom_middleware_bundles": [
    "pre-trace-id.zip",
    "jws-request-signing.zip"
  ]
}
```

The e2e asserts both `X-Trace-Id` and `X-Signature` arrive at the upstream — proof that both pre-hook bundles fired in order.

## Run locally

```bash
npm install
npm test           # vitest in pure Node
npm run build      # dist/plugin.js
npm run build:bundle  # dist/bundle.zip
```
