# Post Correlation ID

Inject an `X-Correlation-Id` into the upstream request. If the inbound request already has one, preserve it; otherwise generate a UUID v4.

## When to use

- Trace a single client request across the gateway → upstream → downstream services
- Honour a caller-provided correlation ID when one exists (multi-hop calls)
- Standardise distributed-trace IDs across APIs without touching the client or upstream

## What it does

On every request after authentication (`post` hook):

1. Reads `request.Headers['X-Correlation-Id']` (multi-value — takes the first non-empty entry).
2. If absent or empty, generates a UUID v4 via the `uuid` npm package.
3. Sets `request.SetHeaders['X-Correlation-Id']` to the resolved value so the upstream sees it.
4. Logs `[correlation-id] using <id> (source: inbound|generated)`.

## Configure

Nothing to configure.

## Try it

```bash
npm install
npm test
npm run build:bundle    # dist/bundle.zip
```

## Notes

- Hook: `post`. Uses `handler.ReturnData(request, {})`.
- Imports `./crypto-shim` before `uuid`. **uuid v9 calls `crypto.getRandomValues()` which goja does not provide** — the shim installs a `Math.random()`-backed fallback. Sufficient for uniqueness; **NOT** cryptographically secure. If you need security-grade randomness, use `crypto-js` (`CryptoJS.lib.WordArray.random(16)`) instead.
- The shim pattern works for any pure-compute lib that wants `crypto.getRandomValues` — `nanoid`, `jose` random helpers, etc. Copy `src/crypto-shim.ts` and import it first in your plugin entry.
