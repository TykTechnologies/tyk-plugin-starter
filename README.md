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
- **Local test harness** in `test/_harness.ts` — mocks the goja runtime so tests run in plain Node via vitest.
- **AGENTS.md** — the constraints brief for AI assistants. Keeps Claude/Cursor/Copilot from suggesting `import axios` or `async/await`.
- **Webpack config** targeting ES5.1 — bundles your TypeScript plus npm deps into a single self-contained JS file the gateway can run.
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

See [AGENTS.md](./AGENTS.md) for the full constraints (no async, no Node APIs, ES5.1 only).

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
npm run build           # dist/plugin.js — single ES5.1 file with all deps inlined
npm run build:bundle    # dist/bundle.zip — manifest.json (with computed md5 checksum) + plugin.js
```

Webpack inlines all your npm dependencies into the output file. You can `npm install jose`, `crypto-js`, `aws4`, `fast-xml-parser`, etc. — **anything that's pure JavaScript and doesn't depend on Node I/O**. See [AGENTS.md](./AGENTS.md) for the I/O rule and the bundle format spec.

> The bundle format is an open spec: zip(plugin.js, manifest.json) with `manifest.checksum = md5(plugin.js)`. The starter ships `scripts/build-bundle.mjs` (~40 lines of Node) to produce this — no Tyk gateway binary required. See AGENTS.md for the full spec so any tool or agent can produce a valid bundle.

## Deploying

Two paths, depending on what fits your case:

- **Inline** — small plugins, single-API, no npm deps. Push `dist/plugin.js` contents into your API definition's `custom_middleware.code` (base64-encoded). Your CI can do this via `tyk-sync`.
- **Bundle** — anything with npm deps, or shared across many APIs. Upload `dist/bundle.zip` to your bundle server (S3, mServ, customer-hosted HTTP), reference by URL in API defs. To run multiple plugins on a single API, list them in `custom_middleware_bundles` — see [examples/README.md](./examples/README.md#composing-multiple-plugins-on-one-api).

## What this starter is NOT

- **Not a gateway** — it doesn't run plugins. Tests use mocks. Real execution happens on your Tyk gateway.
- **Not a deployment tool** — `npm run build` produces an artifact; pushing it is up to your CI / deploy process.
- **Not Node-equivalent** — Tyk plugins run in goja (ES5.1), not Node. The mocks reflect that. If a test passes locally, it should pass in goja.

## License

Apache-2.0
