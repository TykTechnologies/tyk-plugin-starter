# Tyk Goja Plugin Development — AI Brief

This is a Tyk plugin project. Tyk plugins run inside the gateway in a **goja JavaScript runtime** — a Go-implemented ECMAScript engine (roughly ES2020: `let`/`const`, arrow functions, destructuring, template literals, classes, `Promise`, optional chaining `?.`, nullish coalescing `??`, `BigInt`) that is **NOT Node.js**. goja ships in Tyk Gateway **v5.14+**; older gateways run the legacy otto (ES5) engine — see *Targeting older gateways* below.

## Critical runtime constraints

DO NOT use:
- `require()` or `import` resolved at runtime — there is no module loader. Your `import`s are resolved at **build** time by webpack and inlined; nothing is loadable at runtime.
- `setTimeout`, `setInterval`, `setImmediate` — there is no event loop
- Node APIs: `fs`, `http`, `path`, `crypto`, `Buffer` (Buffer is polyfilled at build time only — prefer the `b64enc`/`b64dec` globals)
- `async`/`await` for real concurrency — see the note below

DO use:
- `var`, `let`, `const`, arrow functions, destructuring, spread, template literals, classes
- optional chaining (`?.`), nullish coalescing (`??`), `BigInt`, `Map`/`Set`/`Symbol` — goja supports these
- `Array.prototype` methods, `Object.assign`/`keys`/`values`/`entries`, `JSON.parse`/`JSON.stringify`

The build targets **ES2020** (Tyk v5.14+ javascript), so modern syntax passes through to the gateway unchanged.

**On `async`/`await` and Promises.** goja supports them, and the gateway drains the microtask queue at the end of each invocation — so a Promise that resolves **synchronously** (e.g. `await Promise.resolve(x)`) works. But there is **no event loop**: you cannot `await` a timer or real I/O, and `TykMakeHttpRequest` is already synchronous. Async syntax buys you nothing here — keep handlers synchronous.

### Targeting older gateways (otto)

The goja engine requires Tyk Gateway **v5.14+**. To run on an older gateway, set the plugin driver to `otto`, keep your source within ES5 (no `?.`/`??`/`BigInt`/classes/async), and build with an ES5 target (`tsconfig` `target: ES5`, webpack `target: ['web','es5']`). The gateway docs' *Migrating from otto* section lists the full compatibility differences. New plugins should target goja.

## Available globals

| Global | Purpose |
|---|---|
| `log(msg)` | Write to gateway log (info level) |
| `rawlog(msg)` | Raw log output |
| `b64enc(s)` / `b64dec(s)` | Base64 standard |
| `rawb64enc(s)` / `rawb64dec(s)` | Base64 URL-safe |
| `TykMakeHttpRequest(jsonConfig)` | Synchronous outbound HTTP — returns response as JSON string |
| `TykBatchRequest(jsonConfig)` | Synchronous batched outbound HTTP — returns responses as JSON string |
| `TykGetKeyData(apiKey, apiId)` | Read session data, returns JSON string |
| `TykSetKeyData(apiKey, sessionJson, suppressReset)` | Write session data |

## Handler pattern — every plugin

```ts
/// <reference types="@tyk-technologies/tyk-plugin-types" />

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

**Pick the right return helper for your hook** — the example above uses `ReturnData`, which is correct for `pre`/`post`/`post_key_auth`. **`auth_check` is different**: it uses `handler.NewProcessRequest` for the callback but must return via `handler.ReturnAuthData(request, session)` so the gateway gets a session shape. **`response` hooks** use `handler.NewProcessResponse` and `handler.ReturnResponseData(response, sessionMeta)`. See the table further down.

**Why the `globalThis` assignment is required.** Webpack wraps every entry module in a factory function for code splitting, so `var handler` at the top of your `.ts` file is local to that factory, not visible to the gateway. Assigning to `globalThis.handler` re-exposes it. Without this line, your tests pass but the bundle fails in production with `ReferenceError: handler is not defined at <eval>:1:1`. The starter's harness (`test/_harness.ts`) asserts this assignment exists so this gap doesn't slip through.

## Hook types — pick exactly one

| Hook | When it fires | Return helper | Manifest shape | Reads session? |
|---|---|---|---|---|
| `pre` | Before authentication | `ReturnData` | array `[ {...} ]` | no — session isn't populated yet |
| `auth_check` | Replaces built-in authentication | `ReturnAuthData` | **object `{...}`** (singular) | constructs the session |
| `post_key_auth` | After authentication, before post hooks | `ReturnData` | array `[ {...} ]` | yes — set `require_session: true` |
| `post` | After auth, before upstream is called | `ReturnData` | array `[ {...} ]` | yes if reading session — set `require_session: true` |
| `response` | After upstream returns, before client receives | `ReturnResponseData` | array `[ {...} ]` | optional — set `require_session: true` if needed |

Set the hook in `manifest.json`. One plugin = one hook. To do work in multiple hooks, write multiple plugins.

**Two manifest gotchas, easy to miss:**
1. `auth_check` is a **singular object** under `custom_middleware`, not an array. Every other hook is an array. The gateway parses these as different Go types — putting `auth_check: [{...}]` (array) silently does nothing.
2. `require_session` must be `true` when your plugin reads `session.*` data (everything except `pre`). The default is `false`. With it `false`, `session.meta_data` arrives empty even after authentication.

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
- `uuid` — IDs (see crypto.getRandomValues shim below)
- `ajv`, `joi`, `zod` — validation
- `fast-xml-parser` — XML/JSON conversion
- `aws4` — SigV4 signing for AWS HTTP APIs

### Web Crypto compatibility shim

Goja has no `crypto` global, so libraries that call `crypto.getRandomValues()` (uuid v9, nanoid, jose's random helpers, etc.) need a small shim — webpack's `crypto: false` fallback intentionally omits the Node polyfill. The fix is one short module imported before the offending library:

```ts
// src/crypto-shim.ts
// Goja has no crypto global. Provide a Math.random()-backed getRandomValues
// for libs that only need uniqueness (uuid v4, nanoid). NOT cryptographically
// secure — do NOT use this if the values are security-sensitive (token
// minting, key derivation, nonces).
(function () {
  var g: any = (globalThis as any);
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') return;
  g.crypto = g.crypto || {};
  g.crypto.getRandomValues = function (buf: any) {
    for (var i = 0; i < buf.length; i++) buf[i] = (Math.random() * 256) | 0;
    return buf;
  };
})();
```

Then `import './crypto-shim';` at the top of your plugin entry, before `import { v4 } from 'uuid'`. The `examples/post-correlation-id/` plugin uses this pattern; copy it verbatim. If you need cryptographic randomness, use `crypto-js` (`CryptoJS.lib.WordArray.random(16)`) instead — it ships its own RNG.

## Testing

Tests live in `test/`. Run with `npm test`.

The harness in `test/_harness.ts` installs globals (`TykJS`, `log`, etc.) before importing your plugin. You stub `TykMakeHttpRequest` via `mockHttp.when(...).respond(...)`.

Tests are **synchronous** — matching goja's reality. No async test patterns.

If a test passes locally, it should pass in goja. If it doesn't, the harness has a bug — please file an issue.

## Building

`npm run build` runs webpack with an ES2020 target (Tyk v5.14+ goja), producing `dist/plugin.js` — a single file with all dependencies inlined. This is what the gateway runs.

`npm run build:bundle` produces `dist/bundle.zip` (manifest.json + plugin.js) for the bundle deployment path.

## Bundle format (open spec)

A Tyk plugin bundle is **a zip file** containing two things at the root:

1. `plugin.js` — the webpack output (any name is fine, must match `manifest.file_list`)
2. `manifest.json` — describes hooks, driver, and a checksum

```jsonc
{
  "file_list": ["plugin.js"],
  "custom_middleware": {
    // pre, post, post_key_auth, response are arrays:
    "pre":  [ { "name": "handler", "path": "plugin.js", "require_session": false, "raw_body_only": false } ],
    // auth_check is a SINGULAR object — not an array:
    // "auth_check": { "name": "handler", "path": "plugin.js", "require_session": false, "raw_body_only": false },
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
