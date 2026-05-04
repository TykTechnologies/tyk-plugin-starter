# Tyk Goja Plugin Development — AI Brief

This is a Tyk plugin project. Tyk plugins run inside the gateway in a **Goja JavaScript runtime** — a Go-implemented ES5.1 engine that is **NOT Node.js**.

## Critical runtime constraints

DO NOT use:
- `require()`, `import` resolved at runtime, or any module system
- `async`/`await`, Promises, or any asynchronous primitive
- `setTimeout`, `setInterval`, `setImmediate`
- Node APIs: `fs`, `http`, `path`, `crypto`, `Buffer` (Buffer is polyfilled at build time only)
- ES2015+ features beyond ES2015: optional chaining (`?.`), nullish coalescing (`??`), `BigInt`

DO use:
- `var`, `let`, `const`, arrow functions, destructuring, template literals
- `Array.prototype` methods, `Object.assign`, `JSON.parse`/`JSON.stringify`
- Standard ES2015 syntax — webpack transpiles to ES5.1 at build time

## Available globals

| Global | Purpose |
|---|---|
| `log(msg)` | Write to gateway log (info level) |
| `rawlog(msg)` | Raw log output |
| `b64enc(s)` / `b64dec(s)` | Base64 standard |
| `rawb64enc(s)` / `rawb64dec(s)` | Base64 URL-safe |
| `TykMakeHttpRequest(jsonConfig)` | Synchronous outbound HTTP — returns response as JSON string |
| `TykGetKeyData(apiKey, apiId)` | Read session data, returns JSON string |
| `TykSetKeyData(apiKey, sessionJson, suppressReset)` | Write session data |

## Handler pattern — every plugin

```ts
/// <reference path="./types.d.ts" />

var handler = new TykJS.TykMiddleware.NewMiddleware({});

handler.NewProcessRequest(function (request, session, config) {
  // Read: request.Headers, request.URL, request.Method, request.Body, session.meta_data
  // Modify: request.SetHeaders, request.DeleteHeaders, request.AddParams, etc.
  // Reject: request.ReturnOverrides.ResponseCode = 401; request.ReturnOverrides.ResponseError = "...";
  return handler.ReturnData(request, {});  // sessionMeta as second arg
});

// Required: expose `handler` on the goja runtime's global scope.
(globalThis as any).handler = handler;
```

The variable MUST be named `handler` (or match the `name` in `manifest.json`). The gateway calls `{name}.DoProcessRequest(...)` against the goja runtime's **global** scope.

**Why the `globalThis` assignment is required.** Webpack wraps every entry module in a factory function for code splitting, so `var handler` at the top of your `.ts` file is local to that factory, not visible to the gateway. Assigning to `globalThis.handler` re-exposes it. Without this line, your tests pass but the bundle fails in production with `ReferenceError: handler is not defined at <eval>:1:1`. The starter's harness (`test/_harness.ts`) asserts this assignment exists so this gap doesn't slip through.

## Hook types — pick exactly one

| Hook | When it fires |
|---|---|
| `pre` | Before authentication |
| `auth_check` | Replaces built-in authentication |
| `post_key_auth` | After authentication, before post hooks |
| `post` | After auth, before upstream is called |
| `response` | After upstream returns, before client receives |

Set the hook in `manifest.json`. One plugin = one hook. To do work in multiple hooks, write multiple plugins.

## Return helpers

| Helper | Use for |
|---|---|
| `handler.ReturnData(request, sessionMeta)` | pre, post, post_key_auth |
| `handler.ReturnAuthData(request, session)` | auth_check (returns full session) |
| `handler.ReturnResponseData(response, sessionMeta)` | response |

## I/O rule — important

| Need | Use | Don't |
|---|---|---|
| Outbound HTTP | `TykMakeHttpRequest` | `import axios`, `node-fetch`, `http` |
| Session/key state | `TykGetKeyData` / `TykSetKeyData` | Any DB driver |
| Shared cross-request state | `TykStoreGet/Set/Del` (when shipped) | In-memory variables — runtime is fresh per request |
| LDAP / SQL / Kafka / AMQP | Not yet supported in goja | Don't try — these need gateway bindings |
| Pure-compute libs (JWT, hashing, validation) | npm install + webpack bundles them | — |

**Pure-compute npm libraries that work** (webpack bundles them, no I/O needed):
- `jose`, `jsonwebtoken` — JWT operations
- `crypto-js` — hashing, AES, HMAC (NOT Node's `crypto`)
- `lodash`, `ramda` — utilities
- `date-fns`, `dayjs` — dates
- `uuid` — IDs
- `ajv`, `joi`, `zod` — validation
- `fast-xml-parser` — XML/JSON conversion
- `aws4` — SigV4 signing for AWS HTTP APIs

## Testing

Tests live in `test/`. Run with `npm test`.

The harness in `test/_harness.ts` installs globals (`TykJS`, `log`, etc.) before importing your plugin. You stub `TykMakeHttpRequest` via `mockHttp.when(...).respond(...)`.

Tests are **synchronous** — matching goja's reality. No async test patterns.

If a test passes locally, it should pass in goja. If it doesn't, the harness has a bug — please file an issue.

## Building

`npm run build` runs webpack with ES5.1 target, producing `dist/plugin.js` — a single file with all dependencies inlined. This is what the gateway runs.

`npm run build:bundle` produces `dist/bundle.zip` (manifest.json + plugin.js) for the bundle deployment path.

## Bundle format (open spec)

A Tyk plugin bundle is **a zip file** containing two things at the root:

1. `plugin.js` — the webpack output (any name is fine, must match `manifest.file_list`)
2. `manifest.json` — describes hooks, driver, and a checksum

```jsonc
{
  "file_list": ["plugin.js"],
  "custom_middleware": {
    "pre":  [ { "name": "handler", "path": "plugin.js", "require_session": false, "raw_body_only": false } ],
    "driver": "javascript"
  },
  "checksum": "<md5 hex of file_list bytes concatenated>",
  "signature": ""
}
```

**Checksum rule.** The gateway computes `md5(concat(read(file_list[0]), read(file_list[1]), ...))` after unzipping and compares it to `manifest.checksum`. Mismatch → the gateway logs `invalid checksum` and refuses to load the API. **An empty checksum field is a mismatch** — it is the most common bug when producing bundles by hand.

**Hook key.** Use exactly one of `pre`, `post`, `post_key_auth`, `auth_check`, or `response` under `custom_middleware`. The `name` field must match the variable name your plugin assigns its `NewMiddleware` to (the starter uses `handler`).

**Signing.** Optional. Leave `signature: ""` and the gateway accepts unsigned bundles unless `public_key_path` is set in `tyk.conf`. Signing requires a private key and is documented separately.

**Producing bundles from scratch (no Tyk binary).** The starter's `scripts/build-bundle.mjs` shows the full algorithm in ~40 lines of Node: read manifest, md5 the files in `file_list`, write the populated manifest, zip the lot. Reproduce it in any language — the gateway only checks that the resulting zip matches the spec above.

## Examples

The `examples/` directory contains marquee plugins demonstrating common patterns. Copy a folder, modify, test, deploy.
