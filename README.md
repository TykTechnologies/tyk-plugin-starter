# Tyk Plugin Starter

A complete starter project for writing **Tyk gateway plugins** locally — in your IDE, with full TypeScript autocomplete, AI-assistant ready, runs tests in pure Node, deploys to your Tyk gateway when you're ready.

> **AI agents:** Read [AGENTS.md](./AGENTS.md) first. It captures the goja runtime constraints and the handler pattern.

## Quick start

```bash
git clone https://github.com/TykTechnologies/tyk-plugin-starter my-plugin
cd my-plugin
npm install
npm test           # runs in pure Node — no gateway needed
npm run build      # produces dist/plugin.js
```

That's the inner loop. **No Tyk component required to run any of it.**

## What's in the box

- **Working starter plugin** in `src/plugin.ts` — injects an `X-Trace-Id` header on every request. Replace with your logic.
- **TypeScript types** for the Tyk plugin API via [`@tyk-technologies/tyk-plugin-types`](https://www.npmjs.com/package/@tyk-technologies/tyk-plugin-types) on npm — autocomplete in any IDE.
- **Local test harness** in `test/_harness.ts` — mocks the goja runtime so tests run in plain Node via vitest. Includes faithful mocks of the six shared storage bindings (`TykStorageGet/Set/SetNX/Del/TTL/Incr`), TTL and input limits included, plus a `mockStorage` helper to seed/inspect storage from tests.
- **AGENTS.md** — the constraints brief for AI assistants. Keeps Claude/Cursor/Copilot from suggesting Node APIs like `import axios` or runtime module loading the goja runtime can't do.
- **Webpack config** targeting ES2020 by default (run by goja v5.14+; the guaranteed floor is ES5.1) — bundles your TypeScript plus npm deps into a single self-contained JS file the gateway can run.
- **GitHub Actions** — runs tests and builds on every push, plus an end-to-end suite that exercises every example against a real goja-enabled Tyk OSS gateway in Docker (see [e2e/](./e2e/)).
- **Examples** in [`examples/`](./examples/) — copy-and-adapt patterns covering every hook type (`pre`, `auth_check`, `post_key_auth`, `post`, `response`) plus a multi-bundle composition demo that runs two plugins on a single API.

## The two loops

```
Local (no Tyk needed):                          Deploy (touches Tyk):
  edit → test → build    ────────────────────▶    publish → gateway runs
  (pure Node)                                     (push to dashboard / bundle server)
```

You stay in the local loop until your plugin is ready. Only then do you touch the gateway.

## Writing a plugin

The handler pattern (see `src/plugin.ts`):

```ts
/// <reference types="@tyk-technologies/tyk-plugin-types" />

var handler = new TykJS.TykMiddleware.NewMiddleware({});

handler.NewProcessRequest(function (request, session, config) {
  request.SetHeaders['X-My-Header'] = 'value';

  var resp = JSON.parse(TykMakeHttpRequest(JSON.stringify({
    Method: 'GET',
    Domain: 'https://example.com',
    Resource: '/health',
  })));

  if (resp.Code !== 200) {
    request.ReturnOverrides.ResponseCode = 503;
    request.ReturnOverrides.ResponseError = 'Upstream unhealthy';
  }
  return handler.ReturnData(request, {});
});
```

See [AGENTS.md](./AGENTS.md) for the full constraints (no Node APIs, no runtime module loading, no event loop — goja v5.14+).

## Writing tests

The test harness mocks the goja runtime in plain Node:

```ts
import { test, expect } from 'vitest';
import { runHook, mockRequest, mockSession, mockConfig, mockHttp } from './_harness';
import '../src/plugin';

test('rejects when upstream is down', () => {
  mockHttp.when({ domain: 'https://example.com', resource: '/health' })
          .respond({ Code: 503, Body: '' });

  const result = runHook('pre', mockRequest(), mockSession(), mockConfig());

  expect(result.Request.ReturnOverrides.ResponseCode).toBe(503);
});
```

See `test/plugin.test.ts` for the starter's test.

## Building

```bash
npm run build           # dist/plugin.js — single ES2020 file with all deps inlined
npm run build:bundle    # dist/bundle.zip — manifest.json (with computed md5 checksum) + plugin.js
```

Webpack inlines all your npm dependencies into the output file. You can `npm install jose`, `crypto-js`, `aws4`, `fast-xml-parser`, etc. — **anything that's pure JavaScript and doesn't depend on Node I/O**. See [AGENTS.md](./AGENTS.md) for the I/O rule and the bundle format spec.

> The bundle format is an open spec: zip(plugin.js, manifest.json) with `manifest.checksum = md5(plugin.js)`. The starter ships `scripts/build-bundle.mjs` (~40 lines of Node) to produce this — no Tyk gateway binary required. See AGENTS.md for the full spec so any tool or agent can produce a valid bundle.

## Run it in a local gateway

Spin up a real Tyk gateway in Docker and load your plugin into it with one command — for when you want to exercise the actual goja runtime and proxy path, not just the unit-test mocks.

```bash
npm run dev:up                                 # boot redis + httpbin + gateway (Docker)
npm run dev:load                               # build the root plugin, mount it, hot-reload
npm run dev:load -- examples/rate-limiter      # ...or load any example / plugin dir
curl localhost:8080/<plugin>/get               # exercise it (the slug is printed by dev:load)
npm run dev:logs                               # tail gateway logs
npm run dev:down                               # stop + clean
```

`dev:load` reads the plugin's `manifest.json` (hook + handler name), stages the built `plugin.js` into the gateway, generates a keyless API definition pointed at a bundled httpbin upstream, and hot-reloads. After `dev:up`, each change is just `dev:load` — a webpack build plus a `/tyk/reload`.

The gateway image is the official published `tykio/tyk-gateway:v5.15.0-alpha5` — it recognises the `"javascript"` driver and runs these ES2020/goja plugins natively, so `dev:up` works out of the box with no image build. (Drop the `-alphaN` suffix — `TYK_IMAGE=tykio/tyk-gateway:v5.15.0 npm run dev:up` — once GA publishes.)

Overrides: `TYK_IMAGE` (gateway image), `GW_PORT` (host port, default `8080`), `UPSTREAM_URL` (proxy target, default the bundled httpbin). Generated files land in `dev/apps/` and `dev/middleware/` (gitignored).

## Deploying

Two paths, depending on what fits your case:

- **Inline** — small plugins, single-API. Base64-encode `dist/plugin.js` and put it in your API definition's `custom_middleware.code` (Classic) or the equivalent `code` field under OAS `pluginConfig` (driver `javascript`). Inline `code` is goja-only and is an alternative to `path`/bundle — if both `code` and `path` are set on an entry, `code` wins. Push the updated API definition through the Gateway/Dashboard API from your CI.
- **Bundle** — anything with npm deps, or shared across many APIs. Upload `dist/bundle.zip` to your bundle server (S3, mServ, customer-hosted HTTP) and reference it by name in `custom_middleware_bundle`. A bundle **replaces** the API's inline `custom_middleware`, so don't mix the two. To run multiple plugins on one API, pass a comma-separated list in the same `custom_middleware_bundle` field — see [examples/README.md](./examples/README.md#composing-multiple-plugins-on-one-api).

## What this starter is NOT

- **Not a gateway** — the starter itself doesn't run plugins; tests use mocks. (The optional `dev:*` scripts run your plugin in a real Tyk container locally — see [Run it in a local gateway](#run-it-in-a-local-gateway).)
- **Not a deployment tool** — `npm run build` produces an artifact; pushing it is up to your CI / deploy process.
- **Not Node-equivalent** — Tyk plugins run in goja (v5.14+), not Node. The mocks reflect that. If a test passes locally, it should pass in goja.

## License

Apache-2.0
